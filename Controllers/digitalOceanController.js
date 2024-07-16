require('dotenv').config();
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { AWS_ACCESS_KEY_ID, AWS_SECRET_KEY, BUCKET_NAME } = process.env;

console.log('AWS_ACCESS_KEY_ID:', AWS_ACCESS_KEY_ID);
console.log('AWS_SECRET_ACCESS_KEY:', AWS_SECRET_KEY);

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

const s3 = new S3Client({
    endpoint: "https://syd1.digitaloceanspaces.com",
    region: "syd1",
    credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_KEY
    }
});





async function generateBufferFromFile(filePath) {
  try {
      // Read the file asynchronously
      const buffer = await fs.promises.readFile(filePath);

      // Return the buffer
      return buffer;
  } catch (error) {
      console.error('Error reading file:', error);
      throw error; // Throw the error to handle it in the calling function
  }
}


async function uploadFile({ file, location }) {
  try {
      console.log('Inside uploadFile');

      if (!file || !file.originalname) {
          throw new Error('File object is invalid or missing required properties');
      }

      const filePath = path.join(uploadDir, file.filename); // Adjust for your file naming convention
      const filebuffer = await generateBufferFromFile(filePath);

      let key = `${location ? `${location}/` : ""}${file.originalname}`;

      const uploader = new Upload({
          client: s3,
          params: {
              Bucket: BUCKET_NAME,
              Key: key,
              Body: filebuffer,
              ACL: 'public-read',
              ContentType: file.mimetype,
          }
      });

      const { Key } = await uploader.done();
      return Key;
  } catch (error) {
      console.error('Error during file upload:', error);
      throw error; // Throw the error to handle it in the calling function
  }
}

// Express route to handle file upload
exports.uploadFile = async (req, res, next) => {
  console.log("Inside upload file");
  upload(req, res, async function (err) {
      try {
          if (err) {
              console.error('Error during file upload:', err);
              return next(err); // Pass error to error middleware
          }
          if (!req.file) {
              console.log('No file uploaded');
              return res.status(400).json({ message: 'No file uploaded' });
          }

          console.log('file:', req.file);

          const filePath = path.join(uploadDir, req.file.filename);
          console.log('File uploaded successfully:', filePath);

          let newPath = await uploadFile({ file: req.file, location: "audios" });
          console.log("final Location", newPath);

          return res.status(200).json({
              message: 'File uploaded successfully',
              finalLocation: `https://asset-reports.syd1.digitaloceanspaces.com/${newPath}`
          });
      } catch (error) {
          console.error('Error during file upload:', error);
          res.status(500).json({ message: 'Internal server error' });
      }
  });
};



// Express route to handle file upload

