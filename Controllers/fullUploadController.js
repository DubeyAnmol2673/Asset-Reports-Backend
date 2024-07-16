require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mongoose = require('mongoose');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const ffmpeg = require('fluent-ffmpeg');
const Response = require('../Models/ResponseSchema');
const { validateAndFillKeys } = require('../Controllers/convertToArrays');

// Set the paths to ffmpeg and ffprobe
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const { AWS_ACCESS_KEY_ID, AWS_SECRET_KEY, BUCKET_NAME } = process.env;

console.log('AWS_ACCESS_KEY_ID:', AWS_ACCESS_KEY_ID);
console.log('AWS_SECRET_ACCESS_KEY:', AWS_SECRET_KEY);

const s3 = new S3Client({
  endpoint: "https://syd1.digitaloceanspaces.com",
  forcePathStyle: false,
  region: "syd1",
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_KEY
  }
});

// Set up multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /mp3|mp4|mpeg|mpga|m4a|wav|webm/;
    console.log("inside upload");
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb('Error: Only specified file types are allowed!');
    }
  }
}).single('file');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const splitSize = 10 * 1024 * 1024; // Split size in bytes (10 MB)
const requiredKeys = ['category', 'subcategory', 'clean', 'undamaged', 'working', 'comments'];


const splitFile = (buffer, splitSize) => {
    const { PassThrough } = require('stream');
    const tempDir = './temp'; // Temporary directory to hold split files
  
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
  
    return new Promise((resolve, reject) => {
      const fileParts = [];
      const inputStream = new PassThrough();
      inputStream.end(buffer);
  
      ffmpeg(inputStream)
        .outputOptions([
          '-f segment',
          `-segment_time ${Math.floor(splitSize / (1024 * 1024))}`, // Segment time based on split size
          '-reset_timestamps 1',
          '-c copy'
        ])
        .on('error', (err) => {
          console.error('Error during file splitting:', err.message);
          reject(err);
        })
        .on('end', () => {
          // Read split files into buffers and store in fileParts
          fs.readdir(tempDir, (err, files) => {
            if (err) {
              return reject(err);
            }
            files.forEach((file) => {
              const partPath = path.join(tempDir, file);
              const partBuffer = fs.readFileSync(partPath);
              fileParts.push(partBuffer);
              fs.unlinkSync(partPath); // Remove temporary file
            });
            resolve(fileParts);
          });
        })
        .save(`${tempDir}/output%03d.mp3`); // Save files with .mp3 extension
    });
  };
  
  


  const translateAudioFile = (fileBuffer) => {
    return new Promise((resolve, reject) => {
      console.log(`Starting translation for file`);
      openai.audio.translations.create({
        file: fileBuffer,
        model: "whisper-1"
      })
      .then(translation => {
        console.log(`Translation result:`);
        resolve(translation.text);
      })
      .catch(err => {
        console.error(`Error during translation:`, err.message);
        reject(err); // Ensure to reject the promise on error
      });
    });
  };
  

const getChatCompletions = async (translationsStore) => {
  try {
    console.log('Starting chat completions with translationsStore content:');
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert in creating property condition reports. Please find the input from the inspector who gives a raw inspection which you need to convert into a JSON output as per the following format: ### JSON format: {'result': [{'category': 'name of the main area like study, bathroom, bedroom, etc', 'subcategory': 'name of the parts of category like switch, doormat, fan, etc', 'clean': 'Y or N or null', 'undamaged': 'Y or N or null', 'working': 'Y or N or null', 'comments': 'inspector comments on the part or area'}]} \n\n ### Guidelines:------------- # Create an array of parts and areas for summary. # DO NOT extend it with any sentence. # STRICTLY follow the JSON format. # Y denotes yes and N denotes No # DO NOT make json output in a pretty or beautify format. # DO NOT add \n and \t and tab or spaces in the JSON output. # Make the output a compressed JSON."
        },
        {
          role: "user",
          content: translationsStore
        }
      ]
    });

    console.log('Chat completion response:');
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error during chat completions:', error);
    throw new Error('Internal server error');
  }
};

// Function to upload file to DigitalOcean Spaces
async function uploadFile({ file, location }) {
  let key = `${location ? `${location}/` : ""}${file.originalname}`;
  const command = new PutObjectCommand({
    Key: key,
    Body: file.buffer,
    Bucket: BUCKET_NAME,
    ACL: 'public-read',
    ContentType: file.mimetype,
  });
  await s3.send(command);
  return key;
}

// Express route to handle file upload and processing
exports.useChatResponse = async (req, res, next) => {
  console.log('Starting audio processing');
    console.log(req.body);
  upload(req, res, async function (err) {
    if (err) {
      console.error('Error during file upload:', err);
      return next(err); // Pass error to error middleware
    }
    if (!req.file) {
      console.log('No file uploaded');
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const fileBuffer = req.file.buffer;
    const iText = req.body.text; // Accessing inputText after multer processing
    const userId = req.headers['x-user-id'];
    const username = req.headers['x-username'];
    console.log('Input text received:', iText);
    console.log('User ID:', userId);
    console.log('Username:', username);

    let translationsStore = '';
    let chatResponse = '';

    try {
      if (fileBuffer.length <= splitSize) {
        console.log('File size is smaller than the split size, no need to split.');
        const translation = await translateAudioFile(fileBuffer);
        translationsStore += translation;
        console.log('Translation appended:');

        chatResponse = await getChatCompletions(translationsStore);
        console.log('Chat completion response:');

        try {
          const chatResponseJson = JSON.parse(chatResponse);
          const validatedData = validateAndFillKeys(chatResponseJson.result, requiredKeys);

          // Check if the input text already exists in the database
          let existingResponse = await Response.findOne({ inputText: iText });
          if (existingResponse) {
            console.log('Existing input text found in database, appending response');
            existingResponse.translations += translationsStore;
            console.log(existingResponse, "before concat");
            existingResponse.chatResponse = existingResponse.chatResponse.concat(validatedData);
            console.log(existingResponse, "after concat");
            await existingResponse.save();
            console.log('Updated existing response:', existingResponse);

            // Upload the file to DigitalOcean Spaces and get the file path
            let path = await uploadFile({ location: "audios", file: req.file });

            return res.status(200).json({
              message: 'Audio processed successfully',
              translation: translationsStore,
              chatResponse: existingResponse.chatResponse,
              filePath: `https://syd1.digitaloceanspaces.com/${path}`
            });
          } else {
            const fileId = `${Date.now()}-${req.file.originalname}`;
            const response = new Response({
              userId: userId,
              username: username,
              fileId: fileId,
              chatResponse: validatedData,
              translations: translationsStore,
              inputText: iText
            });

            await response.save();
            console.log('New response saved:', response);

            // Upload the file to DigitalOcean Spaces and get the file path
            let path = await uploadFile({ location: "audios", file: req.file });

            return res.status(200).json({
              message: 'Audio processed successfully',
              translation: translationsStore,
              chatResponse: validatedData,
              filePath: `https://syd1.digitaloceanspaces.com/${path}`
            });
          }
        } catch (jsonError) {
          console.error('Error parsing chat response JSON:', jsonError.message);
          return next(jsonError); // Pass error to error middleware
        }
      }

      const splitFilepaths = await splitFile(fileBuffer, splitSize);
      for (const splitFileBuffer of splitFilepaths) {
        const result = await translateAudioFile(splitFileBuffer);
        translationsStore += result;
        console.log('Translation appended for split file:', translationsStore);
      }

      chatResponse = await getChatCompletions(translationsStore);
      console.log('Chat completion response:', chatResponse);

      try {
        const chatResponseJson = JSON.parse(chatResponse);
        const validatedData = validateAndFillKeys(chatResponseJson.result, requiredKeys);

        // Check if the input text already exists in the database
        let existingResponse = await Response.findOne({ inputText: iText });
        if (existingResponse) {
          console.log('Existing input text found in database, appending response');
          existingResponse.translations += translationsStore;
          console.log(existingResponse, "before concat");
          existingResponse.chatResponse = existingResponse.chatResponse.concat(validatedData);
          console.log(existingResponse, "after concat");
          await existingResponse.save();
          console.log('Updated existing response:', existingResponse);

          // Upload the file to DigitalOcean Spaces and get the file path
          let path = await uploadFile({ location: "audios", file: req.file });

          return res.status(200).json({
            message: 'Audio processed successfully',
            translation: translationsStore,
            chatResponse: existingResponse.chatResponse,
            filePath: `https://syd1.digitaloceanspaces.com/${path}`
          });
        } else {
          const fileId = `${Date.now()}-${req.file.originalname}`;
          const response = new Response({
            userId: userId,
            username: username,
            fileId: fileId,
            chatResponse: validatedData,
            translations: translationsStore,
            inputText: iText
          });

          await response.save();
          console.log('New response saved:', response);

          // Upload the file to DigitalOcean Spaces and get the file path
          let path = await uploadFile({ location: "audios", file: req.file });

          return res.status(200).json({
            message: 'Audio processed successfully',
            translation: translationsStore,
            chatResponse: validatedData,
            filePath: `https://syd1.digitaloceanspaces.com/${path}`
          });
        }
      } catch (jsonError) {
        console.error('Error parsing chat response JSON:', jsonError.message);
        return next(jsonError); // Pass error to error middleware
      }
    } catch (err) {
      console.error('Error during audio processing:', err.message);
      return next(err); // Pass error to error middleware
    }
  });
};
