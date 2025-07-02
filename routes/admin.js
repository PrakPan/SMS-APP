const express = require('express');
const { createUser, getAllForms, signInAdmin, getAllUsers, deleteAllForms, deleteAllUsers } = require('../controllers/adminController');
const { adminAuth } = require('../middleware/auth');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
require('dotenv').config();
const Admin = require('../models/Admin');
const axios = require('axios');

// Existing routes
router.post('/create-user', adminAuth, createUser);
router.post('/sign-in', signInAdmin);
router.get('/forms', adminAuth, getAllForms);
router.get('/users', adminAuth, getAllUsers);
router.delete('/delete/forms', adminAuth, deleteAllForms);
router.delete('/delete/users', adminAuth, deleteAllUsers);

const upload = multer({ storage: multer.memoryStorage() });

// Updated Fast2SMS configuration with new API endpoints
const fast2smsConfig = {
  apiKey: process.env.FAST2SMS_API_KEY,
  // Updated to new API endpoint
  baseUrl: 'https://www.fast2sms.com/dev/bulkV2',
  // Alternative new endpoints
  newBaseUrl: 'https://www.fast2sms.com/dev/v3/sendsms',
  bulkUrl: 'https://www.fast2sms.com/dev/v3/bulk'
};

const messages = [
  "Thank You for submitting your feedback. Detailed google form link is down below: Regards SECURECORE SUPPLY",
  `Thank You {#VAR#} for submitting your feedback. Detailed google form link is down below:

Regards
SECURECORE SUPPLY`,
];


const sendSMS = async (numbers, message, index, templateId = null, retryCount = 0) => {
  const MAX_RETRIES = 2;
  
  try {
    let payload;
    let endpoint = fast2smsConfig.baseUrl; 
    let routeType;

    if (process.env.FAST2SMS_TEMPLATE_ID && process.env.FAST2SMS_ENTITY_ID && process.env.FAST2SMS_SENDER_ID) {
      payload = {
        message: messages[index],
        route: 'dlt_manual',
        numbers: numbers,
        sender_id: process.env.FAST2SMS_SENDER_ID,
        template_id: templateId || process.env.FAST2SMS_TEMPLATE_ID,
        entity_id: process.env.FAST2SMS_ENTITY_ID
      };
      routeType = 'DLT Manual v2 (Cost-Effective)';
      console.log('🔒 Using DLT Manual API v2 (compliant & cost-effective)');
    } else {
      throw new Error('DLT credentials not configured. Cannot use expensive promotional route. Please configure FAST2SMS_TEMPLATE_ID, FAST2SMS_ENTITY_ID, and FAST2SMS_SENDER_ID environment variables.');
    }

    console.log('📤 SMS Payload:', JSON.stringify({ ...payload, numbers: 'HIDDEN' }, null, 2));

    const response = await axios.post(endpoint, payload, {
      headers: {
        'authorization': fast2smsConfig.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 15000
    });
    
    console.log('✅ Fast2SMS v2 API Response:', JSON.stringify(response.data, null, 2));
    
    const isSuccess = response.data.return === true || response.data.return === 'true';
    
    if (isSuccess && response.data.request_id) {
      const requestId = response.data.request_id;
      
      return {
        ...response.data,
        success: true,
        route_used: payload.route,
        route_type: routeType,
        enhanced_status: 'sent_successfully',
        api_version: 'v2',
        request_id: requestId
      };
    } else {
      throw new Error(`SMS API returned failure: ${JSON.stringify(response.data)}`);
    }
    
  } catch (error) {
    console.error('❌ Fast2SMS v2 API Error:', error.response?.data || error.message);
    
    if (retryCount < MAX_RETRIES) {
      console.log(`🔄 Retrying SMS send (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
      
      await new Promise(resolve => setTimeout(resolve, 3000 * (retryCount + 1)));
      return await sendSMS(numbers, message, index, templateId, retryCount + 1);
    }
    
    throw new Error(`Fast2SMS API Error after ${MAX_RETRIES} retries: ${error.response?.data?.message || error.message}`);
  }
};

// Alternative configuration function (for different templates/settings, not expensive routes)
const sendSMSWithDifferentTemplate = async (numbers, message, retryCount = 0) => {
  try {
    // Only try DLT route with different configuration if needed
    if (!process.env.FAST2SMS_TEMPLATE_ID || !process.env.FAST2SMS_ENTITY_ID || !process.env.FAST2SMS_SENDER_ID) {
      throw new Error('DLT credentials required for cost-effective SMS sending');
    }
    
    const payload = {
      message: message,
      route: 'dlt_manual',
      numbers: numbers,
      sender_id: process.env.FAST2SMS_SENDER_ID,
      template_id: process.env.FAST2SMS_TEMPLATE_ID,
      entity_id: process.env.FAST2SMS_ENTITY_ID
    };
    
    console.log('🔄 Retrying with DLT route configuration');

    const response = await axios.post(fast2smsConfig.baseUrl, payload, {
      headers: {
        'authorization': fast2smsConfig.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
    
    const isSuccess = response.data.return === true || response.data.return === 'true';
    
    if (isSuccess && response.data.request_id) {
      return {
        ...response.data,
        success: true,
        route_used: 'dlt_manual',
        route_type: 'DLT Manual v2 (Retry)',
        enhanced_status: 'sent_successfully_retry',
        api_version: 'v2',
        request_id: response.data.request_id
      };
    } else {
      throw new Error(`DLT SMS retry failed: ${JSON.stringify(response.data)}`);
    }
    
  } catch (error) {
    console.error('❌ DLT SMS retry failed:', error.response?.data || error.message);
    throw error;
  }
};

// Fallback SMS function using the working promotional route from diagnostics
const sendSMSFallback = async (numbers, message, retryCount = 0) => {
  try {
    console.log('🔄 Using fallback method with promotional route...');
    
    // Use the old endpoint that's working for promotional route
    const payload = {
      message: message,
      route: 'q', // Promotional route that's working from diagnostics
      numbers: numbers
    };
    
    if (process.env.FAST2SMS_SENDER_ID) {
      payload.sender_id = process.env.FAST2SMS_SENDER_ID;
    }
    
    const response = await axios.post(fast2smsConfig.baseUrl, payload, {
      headers: {
        'authorization': fast2smsConfig.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 15000
    });

    if (response.data.return) {
      console.log('✅ Success with fallback promotional route');
      return {
        ...response.data,
        success: true,
        route_used: 'promotional_fallback',
        enhanced_status: 'sent_via_fallback',
        api_version: 'v2_fallback'
      };
    } else {
      throw new Error('Fallback route failed');
    }
  } catch (error) {
    console.error('❌ Fallback method failed:', error.response?.data || error.message);
    throw error;
  }
};

// Updated delivery status checking for new API
const checkDeliveryStatusNew = async (requestId) => {
  const endpoints = [
    // New API v3 endpoints
    `https://www.fast2sms.com/dev/v3/report/${requestId}?authorization=${fast2smsConfig.apiKey}`,
    `https://www.fast2sms.com/dev/v3/reports?authorization=${fast2smsConfig.apiKey}&request_id=${requestId}`,
    // Fallback to old endpoints
    `https://www.fast2sms.com/dev/report/${requestId}?authorization=${fast2smsConfig.apiKey}`,
    `https://www.fast2sms.com/dev/reports/${requestId}?authorization=${fast2smsConfig.apiKey}`
  ];

  for (let i = 0; i < endpoints.length; i++) {
    try {
      console.log(`📊 Checking delivery status with endpoint ${i + 1}...`);
      
      const response = await axios.get(endpoints[i], {
        timeout: 12000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Fast2SMS-NodeJS-Client/2.0'
        }
      });

      console.log(`📊 Delivery Status (New API Endpoint ${i + 1}):`, response.data);
      return response.data;
    } catch (error) {
      console.log(`❌ Endpoint ${i + 1} failed:`, error.response?.status, error.response?.data?.message);
      if (i === endpoints.length - 1) {
        console.error('❌ All delivery status endpoints failed');
      }
    }
  }
  return null;
};

router.post('/broadcast', adminAuth, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const { index } = req.body;
    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    const message = messages[index];
    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    const phoneNumbers = data.map(row => {
      let phoneField = row.contactNo || row.phone || row.mobile || row.number;

      if (!phoneField) {
      let firstColKey = Object.keys(row)[0];
      phoneField = row[firstColKey];
      }
      if (!phoneField) return null;
      
      let number = phoneField.toString().replace(/\D/g, '');
      
      if (number.startsWith('91') && number.length === 12) {
        number = number.substring(2);
      } else if (number.length === 11 && number.startsWith('0')) {
        number = number.substring(1);
      }else if(number.startsWith('+91') && number.length === 13){
        number = number.substring(3);
      }
      
      if (!/^[6-9]\d{9}$/.test(number)) {
        console.warn(`❌ Invalid phone number: ${phoneField}`);
        return null;
      }
      
      return number;
    }).filter(num => num !== null);

    console.log(`📱 Processed ${phoneNumbers.length} valid numbers from ${data.length} rows`,phoneNumbers);

    if (phoneNumbers.length === 0) {
      return res.status(400).json({ message: 'No valid phone numbers found in the file' });
    }

    const BATCH_SIZE = 30; 
    const results = [];
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < phoneNumbers.length; i += BATCH_SIZE) {
      const batch = phoneNumbers.slice(i, i + BATCH_SIZE);
      const numbersString = batch.join(',');
      
      try {
        console.log(`📤 Sending batch ${Math.floor(i/BATCH_SIZE) + 1} with ${batch.length} numbers...`);
        
        const result = await sendSMS(numbersString, message, index);
        
        results.push({
          batch: Math.floor(i/BATCH_SIZE) + 1,
          numbers: batch,
          success: true,
          request_id: result.request_id || result.requestId,
          route_used: result.route_used,
          api_version: result.api_version
        });
        
        successCount += batch.length;
    
        if (i + BATCH_SIZE < phoneNumbers.length) {
          await new Promise(resolve => setTimeout(resolve, 3000)); 
        }
        
      } catch (error) {
        console.error(`❌ Batch ${Math.floor(i/BATCH_SIZE) + 1} failed:`, error.message);
        
        results.push({
          batch: Math.floor(i/BATCH_SIZE) + 1,
          numbers: batch,
          success: false,
          error: error.message
        });
        
        failureCount += batch.length;
      }
    }

    res.status(200).json({
      message: 'Enhanced broadcast completed',
      summary: {
        total_numbers: phoneNumbers.length,
        successful_sends: successCount,
        failed_sends: failureCount,
        success_rate: `${((successCount / phoneNumbers.length) * 100).toFixed(1)}%`
      },
      batch_results: results,
      api_version: 'v3_enhanced',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Enhanced broadcast error:', error);
    res.status(500).json({ 
      message: 'Server error during enhanced broadcast', 
      error: error.message 
    });
  }
});

router.post('/send-message', adminAuth, async (req, res) => {
  try {
    const { phoneNumber, index } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ message: 'Phone number and message are required' });
    }

    let cleanNumber = phoneNumber.toString().replace(/\D/g, '');
    
    if (cleanNumber.startsWith('91') && cleanNumber.length === 12) {
      cleanNumber = cleanNumber.substring(2);
    } else if (cleanNumber.length === 11 && cleanNumber.startsWith('0')) {
      cleanNumber = cleanNumber.substring(1);
    } else if (cleanNumber.length === 13 && cleanNumber.startsWith('+91')) {
      cleanNumber = cleanNumber.substring(3);
    } 
    else if (cleanNumber.length !== 10) {
      return res.status(400).json({ 
        message: 'Invalid phone number format. Please use 10-digit Indian mobile number.' 
      });
    }

    if (!/^[6-9]\d{9}$/.test(cleanNumber)) {
      return res.status(400).json({ 
        message: 'Invalid Indian mobile number. Must start with 6, 7, 8, or 9 and be 10 digits long.' 
      });
    }

    try {
      const result = await sendSMS(cleanNumber, index, index);
      
      
      if (result.success) {
        res.status(200).json({ 
          message: 'Message sent successfully',
          request_id: result.request_id || result.requestId,
          fast2sms_response: result.message || 'Success',
          sent_to: cleanNumber,
          api_version: result.api_version,
          route_used: result.route_used
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
        message: 'Failed to send message', 
        error: error.message 
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


router.get('/dlt-message', adminAuth, async (req, res) => {
     
    res.status(200).json({ message: messages });
    
});


module.exports = router;