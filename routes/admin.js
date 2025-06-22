const express = require('express');
const { createUser, getAllForms, signInAdmin,getAllUsers, deleteAllForms, deleteAllUsers} = require('../controllers/adminController');
const { adminAuth } = require('../middleware/auth');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const twilio = require('twilio');
require('dotenv').config();
const Admin = require('../models/Admin');
const axios = require('axios');

router.post('/create-user', adminAuth, createUser);
router.post('/sign-in', signInAdmin);
router.get('/forms', adminAuth, getAllForms);
router.get('/users', adminAuth, getAllUsers); 
router.delete('/delete/forms', adminAuth, deleteAllForms);
router.delete('/delete/users', adminAuth, deleteAllUsers);

const upload = multer({ storage: multer.memoryStorage() }); 

const fast2smsConfig = {
  apiKey: process.env.FAST2SMS_API_KEY,
  baseUrl: 'https://www.fast2sms.com/dev/bulkV2'
};

// Helper function to send SMS - Multiple route options
const sendSMS = async (numbers, message, templateId = null) => {
  try {
    let payload;
    let endpoint = fast2smsConfig.baseUrl;

    // Check if we have DLT credentials for transactional messages
    if (process.env.FAST2SMS_TEMPLATE_ID && process.env.FAST2SMS_ENTITY_ID && process.env.FAST2SMS_SENDER_ID) {
      // Use DLT Manual route with proper template
      payload = {
        sender_id: process.env.FAST2SMS_SENDER_ID,
        message: message,
        route: 'dlt_manual',
        numbers: numbers,
        template_id: templateId || process.env.FAST2SMS_TEMPLATE_ID,
        entity_id: process.env.FAST2SMS_ENTITY_ID
      };
      console.log('Using DLT Manual route');
    } else {
      // Use transactional route (can bypass DND for legitimate business messages)
      payload = {
        message: message,
        route: 't', // 't' for transactional (bypasses DND), 'q' for promotional
        numbers: numbers
      };
      
      // Add sender_id if available (optional for transactional)
      if (process.env.FAST2SMS_SENDER_ID) {
        payload.sender_id = process.env.FAST2SMS_SENDER_ID;
      }
      console.log('Using transactional route (t) - can bypass DND');
    }

    console.log('SMS Payload:', JSON.stringify(payload, null, 2));

    const response = await axios.post(endpoint, payload, {
      headers: {
        'authorization': fast2smsConfig.apiKey,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Fast2SMS Response:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('Fast2SMS Error:', error.response?.data || error.message);
    
    // If DLT route fails, try transactional route as fallback
    if (error.response?.data?.message?.includes('template') && payload.route === 'dlt_manual') {
      console.log('DLT route failed, trying transactional route as fallback...');
      try {
        const fallbackPayload = {
          message: message,
          route: 't', // Use transactional route instead of promotional
          numbers: numbers
        };
        
        const fallbackResponse = await axios.post(endpoint, fallbackPayload, {
          headers: {
            'authorization': fast2smsConfig.apiKey,
            'Content-Type': 'application/json'
          }
        });
        
        console.log('Fallback SMS Response:', JSON.stringify(fallbackResponse.data, null, 2));
        return fallbackResponse.data;
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError.response?.data || fallbackError.message);
        throw new Error(`Both DLT and transactional routes failed: ${fallbackError.response?.data?.message || fallbackError.message}`);
      }
    }
    
    // If promotional route fails due to DND, try transactional route
    if (error.response?.data?.message?.includes('DND') && payload.route === 'q') {
      console.log('Promotional route blocked by DND, trying transactional route...');
      try {
        const transactionalPayload = {
          message: message,
          route: 't',
          numbers: numbers
        };
        
        if (process.env.FAST2SMS_SENDER_ID) {
          transactionalPayload.sender_id = process.env.FAST2SMS_SENDER_ID;
        }
        
        const transactionalResponse = await axios.post(endpoint, transactionalPayload, {
          headers: {
            'authorization': fast2smsConfig.apiKey,
            'Content-Type': 'application/json'
          }
        });
        
        console.log('Transactional SMS Response:', JSON.stringify(transactionalResponse.data, null, 2));
        return transactionalResponse.data;
      } catch (transactionalError) {
        console.error('Transactional route also failed:', transactionalError.response?.data || transactionalError.message);
        throw new Error(`DND blocked promotional, transactional also failed: ${transactionalError.response?.data?.message || transactionalError.message}`);
      }
    }
    
    throw new Error(`Fast2SMS API Error: ${error.response?.data?.message || error.message}`);
  }
};

// Template-specific functions for different message types
const sendOrderConfirmation = async (numbers, orderNumber) => {
  const message = `Your order #${orderNumber} has been confirmed. Thank you for shopping with us.`;
  return await sendSMS(numbers, message, process.env.FAST2SMS_ORDER_TEMPLATE_ID);
};

const sendOTPMessage = async (numbers, otp) => {
  const message = `Your OTP is ${otp}. Valid for 10 minutes. Do not share with anyone.`;
  return await sendSMS(numbers, message, process.env.FAST2SMS_OTP_TEMPLATE_ID);
};

const sendGeneralNotification = async (numbers, message) => {
  return await sendSMS(numbers, message, process.env.FAST2SMS_GENERAL_TEMPLATE_ID);
};

// Updated broadcast route
router.post('/broadcast', adminAuth, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    console.log("Data from Excel:", data);
    
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    // Extract phone numbers and clean them
    const phoneNumbers = data.map(row => {
      let number = row.contactNo.toString();
      // Clean and validate phone number
      number = number.replace(/\D/g, ''); // Remove all non-digits
      
      // Handle Indian numbers
      if (number.startsWith('91') && number.length === 12) {
        number = number.substring(2);
      } else if (number.length === 10) {
        // Already a valid 10-digit number
      } else {
        console.warn(`Invalid phone number format: ${row.contactNo}`);
        return null;
      }
      return number;
    }).filter(num => num !== null); // Remove invalid numbers

    console.log("Cleaned phone numbers:", phoneNumbers);

    if (phoneNumbers.length === 0) {
      return res.status(400).json({ message: 'No valid phone numbers found' });
    }

    // Fast2SMS can handle multiple numbers in a single request
    const numbersString = phoneNumbers.join(',');
    
    const result = await sendSMS(numbersString, message);
    
    console.log('Broadcast result:', result);
    
    if (result.return) {
      res.status(200).json({ 
        message: 'Messages sent successfully',
        request_id: result.request_id,
        fast2sms_response: result.message,
        numbers_sent: phoneNumbers.length
      });
    } else {
      res.status(400).json({ 
        message: 'Failed to send messages',
        error: result.message || 'Unknown error',
        full_response: result
      });
    }
    
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
});

// Updated send-message route with better debugging
router.post('/send-message', adminAuth, async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({ message: 'Phone number and message are required' });
    }

    // Clean phone number more thoroughly
    let cleanNumber = phoneNumber.toString().replace(/\D/g, ''); // Remove all non-digits
    
    console.log('Original number:', phoneNumber);
    console.log('Cleaned number before processing:', cleanNumber);
    
    // Handle Indian numbers
    if (cleanNumber.startsWith('91') && cleanNumber.length === 12) {
      cleanNumber = cleanNumber.substring(2);
    } else if (cleanNumber.length === 10) {
      // Already a valid 10-digit number
    } else if (cleanNumber.length === 11 && cleanNumber.startsWith('0')) {
      // Remove leading 0
      cleanNumber = cleanNumber.substring(1);
    } else {
      return res.status(400).json({ 
        message: 'Invalid phone number format. Please use 10-digit Indian mobile number.' 
      });
    }

    console.log('Final cleaned number:', cleanNumber);
    console.log('Message to send:', message);

    // Validate Indian mobile number pattern
    if (!/^[6-9]\d{9}$/.test(cleanNumber)) {
      return res.status(400).json({ 
        message: 'Invalid Indian mobile number. Must start with 6, 7, 8, or 9 and be 10 digits long.' 
      });
    }

    const result = await sendSMS(cleanNumber, message);
    
    console.log('Send message result:', result);
    
    if (result.return) {
      res.status(200).json({ 
        message: 'Message sent successfully',
        request_id: result.request_id,
        fast2sms_response: result.message,
        sent_to: cleanNumber
      });
    } else {
      res.status(400).json({ 
        message: 'Failed to send message',
        error: result.message || 'Unknown error',
        full_response: result
      });
    }
    
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
});

router.post('/test-sms', adminAuth, async (req, res) => {
  try {
    const testNumber = '9125377622'; 
    const testMessage = 'Test message from your SMS service';
    
    const result = await sendSMS(testNumber, testMessage);
    
    res.status(200).json({
      message: 'Test SMS API call completed',
      result: result,
      success: result.return || false
    });
  } catch (error) {
    res.status(500).json({
      message: 'Test SMS failed',
      error: error.message
    });
  }
});

// Add route to check if numbers are in DND
router.post('/check-dnd', adminAuth, async (req, res) => {
  try {
    const { phoneNumbers } = req.body; 
    
    if (!phoneNumbers) {
      return res.status(400).json({ message: 'Phone numbers are required' });
    }
    
    const numbers = Array.isArray(phoneNumbers) ? phoneNumbers : [phoneNumbers];
    const dndResults = {};
    
    for (const number of numbers) {
      let cleanNumber = number.toString().replace(/\D/g, '');
      
      if (cleanNumber.startsWith('91') && cleanNumber.length === 12) {
        cleanNumber = cleanNumber.substring(2);
      } else if (cleanNumber.length === 10) {

      } else {
        dndResults[number] = { error: 'Invalid number format' };
        continue;
      }
      
      try {

        const testPayload = {
          message: 'Test DND check',
          route: 'q',
          numbers: cleanNumber
        };
        
        const response = await axios.post(fast2smsConfig.baseUrl, testPayload, {
          headers: {
            'authorization': fast2smsConfig.apiKey,
            'Content-Type': 'application/json'
          }
        });
        
        dndResults[number] = {
          isDND: false,
          canSendPromo: response.data.return || false,
          response: response.data.message
        };
        
      } catch (error) {
        const isDND = error.response?.data?.message?.includes('DND') || false;
        dndResults[number] = {
          isDND: isDND,
          canSendPromo: false,
          error: error.response?.data?.message || error.message
        };
      }
    }
    
    res.status(200).json({
      message: 'DND check completed',
      results: dndResults
    });
    
  } catch (error) {
    res.status(500).json({
      message: 'DND check failed',
      error: error.message
    });
  }
});

// Add route to test different SMS routes
router.post('/test-routes', adminAuth, async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;
    const testNumber = phoneNumber || '9999999999';
    const testMessage = message || 'Test message';
    
    const routes = ['q', 't', 'dlt_manual'];
    const results = {};
    
    for (const route of routes) {
      try {
        const payload = {
          message: testMessage,
          route: route,
          numbers: testNumber
        };
        
        if (route === 'dlt_manual') {
          payload.sender_id = process.env.FAST2SMS_SENDER_ID;
          payload.template_id = process.env.FAST2SMS_TEMPLATE_ID;
          payload.entity_id = process.env.FAST2SMS_ENTITY_ID;
        } else if (process.env.FAST2SMS_SENDER_ID) {
          payload.sender_id = process.env.FAST2SMS_SENDER_ID;
        }
        
        const response = await axios.post(fast2smsConfig.baseUrl, payload, {
          headers: {
            'authorization': fast2smsConfig.apiKey,
            'Content-Type': 'application/json'
          }
        });
        
        results[route] = {
          success: response.data.return || false,
          response: response.data
        };
      } catch (error) {
        results[route] = {
          success: false,
          error: error.response?.data?.message || error.message
        };
      }
    }
    
    res.status(200).json({
      message: 'Route testing completed',
      results: results
    });
    
  } catch (error) {
    res.status(500).json({
      message: 'Route testing failed',
      error: error.message
    });
  }
});

// Optional: Add route to check wallet balance
router.get('/wallet-balance', adminAuth, async (req, res) => {
  try {
    const response = await axios.get(`https://www.fast2sms.com/dev/wallet?authorization=${fast2smsConfig.apiKey}`);
    
    if (response.data.return) {
      res.status(200).json({
        balance: response.data.wallet,
        currency: 'INR'
      });
    } else {
      res.status(400).json({ message: 'Failed to fetch wallet balance' });
    }
  } catch (error) {
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
});

router.post('/set-message', adminAuth, async (req, res) => {
    try {
        const { message } = req.body;
        const adminId = req.admin._id;

        if (!message) {
            return res.status(400).json({ message: 'Message is required' });
        }

        await Admin.findByIdAndUpdate(adminId, { customMessage: message });

        res.status(200).json({ message: 'Message updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
});

router.get('/get-message', adminAuth, async (req, res) => {
    try {
        const adminId = req.admin._id;
        const admin = await Admin.findById(adminId);

        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        res.status(200).json({ message: admin.customMessage });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
});

module.exports = router;