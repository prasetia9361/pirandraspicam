const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
//const { PiCamera } = require('pi-camera-connect');
const fs = require('fs');
const {exec} = require('child_process');
const path = require('path');
const { promisify } = require('util');
const { Gpio } = require('onoff').Gpio;
const pir = new Gpio(27, "in", "both");
require('dotenv').config();

//const piCamera = new PiCamera();

// Konfigurasi awal
const config = {
  targetNumber: process.env.TARGET_NUMBER + '@c.us',
  imagePath: process.env.IMAGE_PATH || './default.jpg',//'./tmp/capture.jpeg' 
  interval: process.env.INTERVAL || 3600000,
  chromePath: process.env.CHROME_PATH || '/usr/bin/chromium-browser'
};

// Buat directory tmp jika belum ada
//if (!fs.existsSync('./tmp')) {
//  fs.mkdirSync('./tmp');
//}

const OUTPUT_DIR_NAME = 'tmp';
const OUTPUT_DIR = path.join(__dirname, OUTPUT_DIR_NAME); // Creates a path like /home/pi/your_project_folder/captures_libcamera

// 3. Ensure the output directory exists, create it if it doesn't
// This is where fs.existsSync and fs.mkdirSync are used.
try {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true }); // 'recursive: true' creates parent directories if needed
        console.log(`Created directory: ${OUTPUT_DIR}`);
    }
} catch (err) {
    console.error(`Error creating directory ${OUTPUT_DIR}:`, err);
    process.exit(1); // Exit if we can't create the directory
}

// Validasi environment variables
if (!process.env.TARGET_NUMBER) {
  console.error('❌ TARGET_NUMBER harus diisi di file .env');
  process.exit(1);
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './session' }),
  puppeteer: { 
    headless: true,
    executablePath: config.chromePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--single-process'
    ]
  }
});

// Fungsi terpisah untuk logging
const logger = {
  info: (msg) => console.log(`[${new Date().toISOString()}] ℹ️  ${msg}`),
  error: (msg) => console.error(`[${new Date().toISOString()}] ❌ ${msg}`),
  success: (msg) => console.log(`[${new Date().toISOString()}] ✅ ${msg}`)
};

// Fungsi untuk mengambil foto dengan kamera
//const captureImage = async () => {
//  try {
//    const image = await piCamera.takePicture();
//    await fs.writeFile(config.imagePath, image);
//    logger.info('Mengambil foto...');
//    return true;
//  } catch (err) {
//    logger.error(`Gagal mengambil foto: ${err.message}`);
//    return false;
//  }
//};

function captureImageLibcamera(fileName = `capture.jpg`) {
    return new Promise((resolve, reject) => {
        const filePath = path.join(OUTPUT_DIR, fileName);

        // Construct the libcamera-jpeg command
        // -o: output file path
        // -t: timeout in milliseconds (allows camera to adjust exposure/focus)
        // --width, --height: desired image resolution
        // --nopreview: prevents a preview window from appearing on the Pi's display (good for headless operation)
        // --rotation: (optional) 0, 90, 180, 270 degrees
        // For more options, run `libcamera-jpeg --help` in your Pi's terminal.
        const command = `libcamera-jpeg -o "${filePath}" -t 2000 --width 1920 --height 1080 --nopreview`;

        console.log(`Executing command: ${command}`);

        // Execute the command
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing libcamera-jpeg: ${error.message}`);
                console.error(`Stderr: ${stderr}`); // Print stderr for more detailed error info
                return reject(new Error(`libcamera-jpeg execution failed: ${error.message}\nStderr: ${stderr}`));
            }

            // libcamera-jpeg might output informational messages to stderr even on success.
            // It's good to log it for debugging, but it doesn't always mean an error.
            if (stderr) {
                console.warn(`libcamera-jpeg stderr (may be informational): ${stderr}`);
            }

            // stdout usually contains information from libcamera-jpeg if successful.
            if (stdout) {
                console.log(`libcamera-jpeg stdout: ${stdout}`);
            }

            console.log(`Image captured successfully: ${filePath}`);
            resolve(filePath); // Resolve the promise with the path to the saved image
        });
    });
}

// Fungsi terpisah untuk mengirim gambar
const sendAutoImage = async () => {
  try {
    const media = await MessageMedia.fromFilePath(config.imagePath);
    await client.sendMessage(config.targetNumber, media, { 
      caption: process.env.CAPTION || 'Foto dari Raspberry Pi Camera'
    });
    logger.success(`Gambar berhasil dikirim ke ${config.targetNumber}`);

    // Hapus file setelah berhasil dikirim
    try {
      fs.unlinkSync(config.imagePath);
      logger.info(`File temporary ${config.imagePath} berhasil dihapus`);
    } catch (err) {
      logger.error(`Gagal menghapus file temporary: ${err.message}`);
    }
    
  } catch (err) {
    logger.error(`Gagal mengirim gambar: ${err.message}`);
  }
};

async function main(){
  client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => {
    logger.success('Autentikasi berhasil');
  });
  
  try{
    
    client.on('ready', async () => {
      logger.success('Client siap!');
      logger.info('Tekan "q" untuk mengirim gambar');
      
      try {
        // Validasi nomor tujuan
        const isValidNumber = await client.isRegisteredUser(config.targetNumber);
        if (!isValidNumber) {
          logger.error('Nomor tidak terdaftar di WhatsApp');
          return;
        }

        // Setup input keyboard
        process.stdin.setEncoding('utf8');
        if (process.stdin.isTTY) process.stdin.setRawMode(true);
        let isProcessing = false; 
        process.stdin.on('data', async (key) => {
          // Tekan Ctrl+C atau 'q' untuk keluar
          if (key === '\u0003') {
            logger.info('Mematikan client...');
            await client.destroy();
            process.exit();
          } 
        });

        // Pasang listener PIR di sini
        pir.watch(async (err, value) => {
          if (err) {
            logger.error(`Sensor error: ${err.message}`);
            return;
          }

          if (value === 1) {
            if (isProcessing) {
              logger.info('Proses sebelumnya masih berjalan...');
              return;
            }
            
            isProcessing = true;
            try {
              const success = await captureImageLibcamera();
              if (success) {
                await sendAutoImage();
              }
            } finally {
              isProcessing = false;
            }
          }
        });
      } catch (err) {
        logger.error(`Gagal inisialisasi: ${err.message}`);
        process.exit(1);
      }
    });
    
    } catch (err){
      logger.error(`Gagal inisialisasi: ${err.message}`);
//      process.exit(1);
      }
  }

main();

// Handle shutdown
process.on('SIGINT', async () => {
  logger.info('Mematikan client...');
  await client.destroy();
  logger.info('Client dimatikan');
  pir.unexport();
  process.exit();
});

// Handle error global
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
});

client.initialize();
