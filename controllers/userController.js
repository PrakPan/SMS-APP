const User = require('../models/User');
const Form = require('../models/Form');
const Admin = require('../models/Admin');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const twilioClient = require('../twilio/twilio');
require('dotenv').config();
const axios = require('axios');

const fast2smsConfig = {
  apiKey: process.env.FAST2SMS_API_KEY,
  // Updated to new API endpoint
  baseUrl: 'https://www.fast2sms.com/dev/bulkV2',
  // Alternative new endpoints
  newBaseUrl: 'https://www.fast2sms.com/dev/v3/sendsms',
  bulkUrl: 'https://www.fast2sms.com/dev/v3/bulk'
};

const sendSMS = async (numbers, message, templateId = null, retryCount = 0) => {
  const MAX_RETRIES = 2;
  
  try {
    let payload;
    let endpoint = fast2smsConfig.baseUrl; 
    let routeType;

    if (process.env.FAST2SMS_TEMPLATE_ID && process.env.FAST2SMS_ENTITY_ID && process.env.FAST2SMS_SENDER_ID) {
      payload = {
        message: "Thank You  for submitting your feedback. Detailed google form link is down below: Regards SECURECORE SUPPLY",
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
      return await sendSMS(numbers, message, templateId, retryCount + 1);
    }
    
    throw new Error(`Fast2SMS API Error after ${MAX_RETRIES} retries: ${error.response?.data?.message || error.message}`);
  }
};

exports.signInUser = async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = await User.findOne({ username });
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        const token = jwt.sign({ userId: user._id }, process.env.SECRET_KEY, { expiresIn: '1h' });
        res.status(200).json({ message: 'Sign In successful', token });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
};

// controllers/adminController.js
exports.submitForm = async (req, res) => {
    try {
        const { 
            // name, 
            contactNo, city, remarks, selectedEmoji } = req.body;
        const userId = req.user._id;

        console.log('User ID:', userId);

        const form = new Form({
            // name,
            contactNo,
            city,
            remarks,
            selectedEmoji,
            user: userId,
        });

        await form.save();

        const user = await User.findById(userId).populate('admin');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // console.log('User:', user);
        
        // const customMessage = user?.admin?.customMessage || 'Thank you for submitting the form!';

        // console.log('Custom Message:', customMessage);

        // Send thank you message
        // try {
        
            if (!contactNo) {
              return res.status(400).json({ message: 'Phone number and message are required' });
            }
        
            let cleanNumber = contactNo.toString().replace(/\D/g, '');
            
            if (cleanNumber.startsWith('91') && cleanNumber.length === 12) {
              cleanNumber = cleanNumber.substring(2);
            } else if (cleanNumber.length === 11 && cleanNumber.startsWith('0')) {
              cleanNumber = cleanNumber.substring(1);
            }else if (cleanNumber.length === 13 && cleanNumber.startsWith('+91')) {
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
        
              let message ="Hi";
              const result = await sendSMS(cleanNumber, message);
              
              
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
            
          } 

       
     catch (error) {
        console.error('Error:', error);
        res.status(500).json({ message: 'Server error', error });
    }
};


exports.selectEmoji = async (req, res) => {
    try {
        const { selectedEmoji } = req.body;
        if (!selectedEmoji) {
            return res.status(400).json({ message: 'Emoji type is required' });
        }

        req.user.selectedEmoji = selectedEmoji;
        await req.user.save();
        res.status(200).json({ message: 'Emoji selected', selectedEmoji });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
};
