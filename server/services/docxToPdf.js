const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

async function convertDocxToPdf(inputPath, outputDir) {
    try {
        if (!inputPath || typeof inputPath !== 'string') {
            throw new Error('Input path is required and must be a string');
        }

        if (!outputDir || typeof outputDir !== 'string') {
            throw new Error('Output directory is required and must be a string');
        }

        try {
            await fs.access(inputPath);
        } catch (error) {
            throw new Error(`Input file does not exist: ${inputPath}`);
        }

        const fileExtension = path.extname(inputPath).toLowerCase();
        if (fileExtension !== '.docx') {
            throw new Error(`Invalid file type. Expected .docx, got: ${fileExtension}`);
        }

        try {
            await fs.access(outputDir);
        } catch (error) {
            await fs.mkdir(outputDir, { recursive: true });
        }

        const libreOfficePaths = [
            '/opt/homebrew/bin/libreoffice',    // macOS Homebrew
            '/usr/bin/libreoffice',             // Linux standard
            '/usr/bin/soffice',                 // Alternative Linux path
            'libreoffice',                      // System PATH
            'soffice'                           // Alternative system PATH
        ];

        let libreOfficeCommand = null;
        let workingPath = null;

        for (const librePath of libreOfficePaths) {
            try {
                await execAsync(`${librePath} --version`);
                workingPath = librePath;
                break;
            } catch (error) {
                continue;
            }
        }

        if (!workingPath) {
            throw new Error(
                'LibreOffice is not installed or not found in PATH. ' +
                'Please install LibreOffice to use this function. ' +
                'On macOS: brew install --cask libreoffice ' +
                'On Ubuntu/Debian: sudo apt-get install libreoffice ' +
                'On CentOS/RHEL: sudo yum install libreoffice'
            );
        }

        const inputFileName = path.basename(inputPath, '.docx');
        const outputFileName = `${inputFileName}.pdf`;
        const outputPath = path.join(outputDir, outputFileName);
        const command = `"${workingPath}" --headless --nologo --convert-to pdf:"writer_pdf_Export" --outdir "${outputDir}" "${inputPath}"`;

        console.log(`🔄 Converting ${path.basename(inputPath)} to PDF using LibreOffice...`);
        console.log(`📁 Output directory: ${outputDir}`);
        const { stdout, stderr } = await execAsync(command, {
            timeout: 30000,
            maxBuffer: 1024 * 1024 * 10
        });
        try {
            await fs.access(outputPath);
            console.log(`✅ Successfully converted to: ${outputPath}`);
        } catch (error) {
            if (stderr && stderr.trim()) {
                throw new Error(`LibreOffice conversion failed: ${stderr}`);
            } else {
                throw new Error('PDF conversion failed - no output file was created');
            }
        }

        const stats = await fs.stat(outputPath);
        if (stats.size === 0) {
            throw new Error('Generated PDF file is empty');
        }

        return outputPath;

    } catch (error) {
        try {
            const inputFileName = path.basename(inputPath, '.docx');
            const outputPath = path.join(outputDir, `${inputFileName}.pdf`);
            await fs.unlink(outputPath);
        } catch (cleanupError) {
        }

        if (error.code === 'ENOENT') {
            throw new Error(`LibreOffice command not found. Please install LibreOffice: ${error.message}`);
        } else if (error.code === 'ETIMEDOUT') {
            throw new Error(`Conversion timed out after 30 seconds: ${error.message}`);
        } else if (error.code === 'ENOMEM') {
            throw new Error(`Insufficient memory for conversion: ${error.message}`);
        }

        throw error;
    }
}

async function isLibreOfficeAvailable() {
    const libreOfficePaths = [
        '/opt/homebrew/bin/libreoffice',
        '/usr/bin/libreoffice',
        '/usr/bin/soffice',
        'libreoffice',
        'soffice'
    ];

    for (const librePath of libreOfficePaths) {
        try {
            await execAsync(`${librePath} --version`);
            return true;
        } catch (error) {
            continue;
        }
    }
    return false;
}

async function getLibreOfficeVersion() {
    const libreOfficePaths = [
        '/opt/homebrew/bin/libreoffice',
        '/usr/bin/libreoffice',
        '/usr/bin/soffice',
        'libreoffice',
        'soffice'
    ];

    for (const librePath of libreOfficePaths) {
        try {
            const { stdout } = await execAsync(`${librePath} --version`);
            return stdout.trim();
        } catch (error) {
            continue;
        }
    }
    return null;
}

module.exports = {
    convertDocxToPdf,
    isLibreOfficeAvailable,
    getLibreOfficeVersion
};

