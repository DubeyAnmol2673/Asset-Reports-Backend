const mongoose = require('mongoose');
const OpenAI = require('openai');
const path = require('path');
const aws = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const fs = require('fs');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const ffmpeg = require('fluent-ffmpeg');
const Response = require('../Models/ResponseSchema');
const { validateAndFillKeys } = require('../Controllers/convertToArrays');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { AWS_ACCESS_KEY_ID, AWS_SECRET_KEY, BUCKET_NAME } = process.env;
const { uploadFile } = require('../Utils/S3');
// Set the paths to ffmpeg and ffprobe
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Ensure the uploads directory exists
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // Upload destination folder
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const filetypes = /mp3|mp4|mpeg|mpga|m4a|wav|webm/;
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

const splitSize = 5* 1024 * 1024; // Split size in bytes (2 MB)
const requiredKeys = ['category', 'subcategory', 'clean', 'undamaged', 'working', 'comments'];

const splitFile = (inputFilePath, splitSize) => {
    return new Promise((resolve, reject) => {
        fs.stat(inputFilePath, (err, stats) => {
            if (err) return reject(err);
            const totalSize = stats.size;
            console.log('Total file size:', totalSize);
            const numberOfParts = Math.ceil(totalSize / splitSize);
            console.log('Number of parts:', numberOfParts);

            ffmpeg.ffprobe(inputFilePath, (err, metadata) => {
                if (err) return reject(err);
                const duration = metadata.format.duration;
                const partDuration = duration / numberOfParts;
                console.log('Total duration:', duration);
                console.log('Duration per part:', partDuration);

                const splitFilepaths = [];
                let partsProcessed = 0;

                const processPart = (i) => {
                    return new Promise((resolvePart, rejectPart) => {
                        const startTime = i * partDuration;
                        const outputFilePath = path.join(__dirname, '..', 'uploads', `${Date.now()}-split${i + 1}.mp3`);
                        console.log(`Processing part ${i + 1}: start time ${startTime}, duration ${partDuration}`);

                        ffmpeg(inputFilePath)
                            .setStartTime(startTime)
                            .setDuration(partDuration)
                            .output(outputFilePath)
                            .on('end', () => {
                                splitFilepaths[i] = outputFilePath; // Maintain order by index
                                console.log(`Part ${i + 1} created: ${outputFilePath}`);
                                const splitFileSize = fs.statSync(outputFilePath).size / (1024 * 1024);
                                console.log(`Size of part ${i + 1}: ${splitFileSize.toFixed(2)} MB`);

                                partsProcessed += 1;
                                if (partsProcessed === numberOfParts) {
                                    resolve(splitFilepaths);
                                }
                                resolvePart();
                            })
                            .on('error', (err) => {
                                console.error(`Error creating part${i + 1}: ${err.message}`);
                                rejectPart(err);
                            })
                            .run();
                    });
                };

                const processParts = Array.from({ length: numberOfParts }, (_, i) => processPart(i));
                Promise.all(processParts)
                    .then(() => resolve(splitFilepaths))
                    .catch(reject);
            });
        });
    });
};

const translateAudioFile = (filePath) => {
    console.log("in translate audio file")
    return new Promise((resolve, reject) => {
        console.log(`Starting translation for file: ${filePath}`);
        openai.audio.translations.create({
            file: fs.createReadStream(filePath),
            model: "whisper-1"
        }).then(translation => {
            console.log(`Translation result for file ${filePath}:`);
            resolve(translation.text);
        }).catch(err => {
            console.error(`Error during translation for file ${filePath}:`, err.message);
            reject(err);
        });
    });
};

const getChatCompletions = async (translationsStore) => {
    try {
        console.log('Starting chat completions with translationsStore content:');
     

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "You are an expert in creating property condition report. Please find the input from the inspector who gives a raw inspection which you need to convert into a JSON output as per the following format: ### JSON format: {\"result\": [{\"category\": \"name of the main area like study, bathroom, bedroom, etc\", \"subcategory\": \"name of the parts of category like switch, doormat, fan, etc\", \"clean\": \"Y or N or null\", \"undamaged\": \"Y or N or null\", \"working\": \"Y or N or null\", \"comments\": \"inspector comments on the part or area\"}]} \n\n ### Guidelines:------------- # Create an array of parts and areas for summary. # DO NOT extend it with any sentence. # STRICTLY follow the JSON format. # Y denotes yes and N denotes No # DO NOT make json output in a pretty or beautify format. # DO NOT add \n and \t and tab or spaces in the JSON output. # DO NOT start output response with ```json and DO NOT end response with ```. # ONLY Return the Pure JSON without any text or word in the beginning or the end. # We have to PARSE the output response, so DO NOT add anything that can throw an ERROR."
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


exports.useChatResponse = async (req, res, next) => {
    console.log('Starting audio processing correctly');

    upload(req, res, async function (err) {
        if (err) {
            console.error('Error during file upload:', err);
            return next(err); // Pass error to error middleware
        }
        if (!req.file) {
            console.log('No file uploaded');
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const filePath = path.join(__dirname, '..', 'uploads', req.file.filename);
        console.log('File uploaded successfully:');

        const iText = req.body.text; // Accessing inputText after multer processing
        const userId = req.headers['x-user-id'];
        const username = req.headers['x-username'];
        console.log('Input text received:', iText);
        console.log('User ID:', userId);
        console.log('Username:', username);

        let splitFilepaths = [];
        let translationsStore = '';
        let chatResponse = '';

        try {
            const fileSize = fs.statSync(filePath).size;
            console.log('File size:', fileSize);

            if (fileSize <= splitSize) {
                console.log('File size is smaller than the split size, no need to split.');
                const translation = await translateAudioFile(filePath);
                console.log("translation",translation);
                translationsStore += translation;
                console.log("translation store" , translationsStore);
                

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
                        let path = await uploadFile({ location: "audios", file: req.file });
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

            splitFilepaths = await splitFile(filePath, splitSize);
            for (const splitFilePath of splitFilepaths) {
                const result = await translateAudioFile(splitFilePath);
                translationsStore += result;
                console.log('Translation appended for split file:', translationsStore);
            }

            chatResponse = await getChatCompletions(translationsStore);
            console.log('Chat completion response:', chatResponse);



            try {
            if (!chatResponse) {
                    return res.status(500).json({ message: 'Empty response from API' });
                }
                
                const newResponse = chatResponse.replace(/'/g, '"');
               
              const chatResponseJson = JSON.parse(newResponse);
                const validatedData = validateAndFillKeys(chatResponseJson.result, requiredKeys);
              

              
                // Check if the input text already exists in the database
                let existingResponse = await Response.findOne({ inputText: iText });
                if (existingResponse) {
                    console.log('Appending new data to existing response');
                    existingResponse.translations += translationsStore;
                    existingResponse.chatResponse = existingResponse.chatResponse.concat(validatedData);
                    console.log("before mongo save");
                    await existingResponse.save();
                    console.log("after mongo save");
                    console.log('Updated existing response:', existingResponse);
             

                    res.status(200).json({
                        message: 'Audio processed successfully',
                        translation: translationsStore,
                        chatResponse: existingResponse.chatResponse
                    });
                } else {
                    console.log('Creating a new response');

                    const fileId = `${Date.now()}-${req.file.originalname}`;
                    const response = new Response({
                        userId: userId,
                        username: username,
                        fileId: fileId,
                        chatResponse: validatedData,
                        translations: translationsStore,
                        inputText: iText
                    });
                    console.log("before mongo save");
                    await response.save();
                    console.log('New response saved:', response);

                    res.status(200).json({
                        message: 'Audio processed successfully',
                        translation: translationsStore,
                        chatResponse: validatedData
                    });
                }
            } catch (jsonError) {
                console.error('Error parsing chat response JSON:', jsonError.message);
                jsonError.name = "use Chat Response Parsing Failed";
                next(jsonError); // Pass error to error middleware
            }
        } catch (error) {
            console.error('Error during processing:', error);
            error.name = "audio processing";
            next(error); // Pass error to error middleware
        } finally {
            // Optionally remove the original and split files after processing
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error('Error removing original file:', err);
                } else {
                    console.log('Original file removed successfully:', filePath);
                }
            });

            splitFilepaths.forEach((splitFilePath) => {
                fs.unlink(splitFilePath, (err) => {
                    if (err) {
                        console.error('Error removing split file:', err);
                    } else {
                        console.log('Split file removed successfully:', splitFilePath);
                    }
                });
            });
        }
    });
};



exports.useUploadFile = async (req, res, next) => {


};
