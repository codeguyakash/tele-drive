const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const mime = require('mime-types');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const bot = new TelegramBot(token, { polling: true });

app.set('view engine', 'ejs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});

if (!fs.existsSync('uploads')) {
    try {
        fs.mkdirSync('uploads');
    } catch (error) {
        console.error('Failed to create uploads directory:', error);
    }
}

app.get('/', async (req, res) => {
    try {
        const files = await fs.promises.readdir('uploads/');
        res.render('index', { files });
    } catch (err) {
        console.error('Unable to scan files:', err);
        res.status(500).send('Unable to scan files!');
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    console.log(chatId);

    if (msg.document) {
        const fileId = msg.document.file_id;
        const fileName = msg.document.file_name;

        try {
            await bot.downloadFile(fileId, 'uploads');
            bot.sendMessage(chatId, `File ${fileName} chat id ${chatId} has been saved successfully!`);
        } catch (err) {
            console.error('Failed to download file:', err);
            bot.sendMessage(chatId, `Failed to save the file ${fileName}.`);
        }
    } else {
        bot.sendMessage(chatId, 'Please send a document to save.');
    }
});

app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', filename);

    try {
        if (fs.existsSync(filePath)) {
            res.download(filePath);
        } else {
            res.status(404).send('File not found');
        }
    } catch (err) {
        console.error('Error during file download:', err);
        res.status(500).send('Error during file download.');
    }
});

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }

        const filePath = path.join(__dirname, 'uploads', req.file.originalname);
        const fileSize = fs.statSync(filePath).size;
        const maxFileSize = 50 * 1024 * 1024;

        if (fileSize > maxFileSize) {
            return res.status(400).send('File size exceeds the maximum limit of 50 MB.');
        }

        const mimeType = mime.contentType(req.file.originalname) || 'application/octet-stream';

        try {
            await bot.sendDocument(chatId, filePath, {}, {
                caption: `File ${req.file.originalname} uploaded via web interface.`,
                contentType: mimeType
            });
            console.log('File sent to Telegram successfully.');

            try {
                fs.unlink(filePath, (err) => {
                    if (err) {
                        console.error('Failed to delete file:', err);
                    } else {
                        console.log('File deleted successfully.');
                    }
                });
            } catch (unlinkError) {
                console.error('Failed to unlink file:', unlinkError);
            }

        } catch (error) {
            console.error('Failed to send file to Telegram:', error);
        }

        res.render('confirmation', { fileName: req.file.originalname });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).send('An error occurred during file upload.');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
