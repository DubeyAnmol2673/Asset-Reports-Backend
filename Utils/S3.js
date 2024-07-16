// ../Utils/S3.js

const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer');


const storage = multer.memoryStorage();
const upload = multer({ storage });



const s3 = new S3Client({
  endpoint: "https://syd1.digitaloceanspaces.com",
  forcePathStyle: false,
  region: "syd1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey:process.env.AWS_SECRET_KEY
  }
});

// Function to upload file to DigitalOcean Spaces
async function uploadFile({ file, location }) {
  let key = `${location ? `${location}/` : ""}${file.originalname}`;
  const command = new PutObjectCommand({
    Key: key,
    Body: file.buffer,
    Bucket: process.env.BUCKET_NAME,
    ACL: 'public-read',
    ContentType: file.mimetype,
  });
  await s3.send(command);
  return key;
}

module.exports = {
    uploadFile
};
