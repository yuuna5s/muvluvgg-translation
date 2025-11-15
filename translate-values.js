const fs = require('fs');
const path = require('path');
const http = require('http');

// Sugoi Offline Translator API configuration
const SUGOI_PORTS = [14366];
const SUGOI_PATH = '/';

// Translate Japanese to English using Sugoi Offline Translator
function translateWithSugoi(japaneseText, port = null) {
    return new Promise((resolve, reject) => {
        if (!japaneseText || japaneseText.trim() === '') {
            resolve(japaneseText);
            return;
        }

        // Sugoi API format: {message: "translate sentences", content: "text to translate"}
        const requestFormats = [
            { message: 'translate sentences', content: japaneseText }
        ];

        const portsToTry = port ? [port] : SUGOI_PORTS;
        
        const tryTranslation = (portIndex, formatIndex) => {
            if (portIndex >= portsToTry.length) {
                console.error(`Failed to translate after trying all ports and formats`);
                resolve(japaneseText); // Fallback to original
                return;
            }

            const currentPort = portsToTry[portIndex];
            const postData = JSON.stringify(requestFormats[formatIndex]);

            const options = {
                hostname: 'localhost',
                port: currentPort,
                path: SUGOI_PATH,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: 60000  // 60 seconds - translation can take time
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        // Sugoi API returns the translation directly as a JSON string
                        const result = JSON.parse(data);
                        // The result is the translation string itself (not wrapped in an object)
                        if (typeof result === 'string') {
                            resolve(result);
                            return;
                        } else {
                            // If it's an object, try common fields
                            const translation = result.content || result.translation || result.text || JSON.stringify(result);
                            resolve(translation);
                            return;
                        }
                    } catch (error) {
                        // Try next format
                        if (formatIndex < requestFormats.length - 1) {
                            tryTranslation(portIndex, formatIndex + 1);
                        } else {
                            // Try next port
                            tryTranslation(portIndex + 1, 0);
                        }
                    }
                });
            });

            req.on('error', (error) => {
                // Try next format or port
                if (formatIndex < requestFormats.length - 1) {
                    tryTranslation(portIndex, formatIndex + 1);
                } else {
                    tryTranslation(portIndex + 1, 0);
                }
            });

            req.on('timeout', () => {
                req.destroy();
                if (formatIndex < requestFormats.length - 1) {
                    tryTranslation(portIndex, formatIndex + 1);
                } else {
                    tryTranslation(portIndex + 1, 0);
                }
            });

            req.write(postData);
            req.end();
        };

        tryTranslation(0, 0);
    });
}

// Recursively translate all values in the object
async function translateObjectValues(obj, delayCounter = { count: 0 }) {
    if (Array.isArray(obj)) {
        const result = [];
        for (const item of obj) {
            if (typeof item === 'object' && item !== null) {
                result.push(await translateObjectValues(item, delayCounter));
            } else if (typeof item === 'string') {
                // Translate array items if they're strings
                result.push(await translateWithSugoi(item));
                delayCounter.count++;
                if (delayCounter.count % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } else {
                result.push(item);
            }
        }
        return result;
    } else if (typeof obj === 'object' && obj !== null) {
        const result = {};
        const keys = Object.keys(obj);
        
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const value = obj[key];
            
            // Recursively translate nested objects
            if (typeof value === 'object' && value !== null) {
                result[key] = await translateObjectValues(value, delayCounter);
            } else if (typeof value === 'string') {
                // Translate the Japanese key to English and use it as the value
                // Note: Newlines (\n) in the Japanese key will be preserved in the translation
                const englishTranslation = await translateWithSugoi(key);
                result[key] = englishTranslation;
                
                // Add small delay to avoid overwhelming the server
                delayCounter.count++;
                if (delayCounter.count % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } else {
                result[key] = value;
            }
        }
        return result;
    }
    return obj;
}

async function processJsonFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        
        console.log(`Processing ${filePath}...`);
        
        // Translate all values (keeping keys as Japanese)
        const translatedData = await translateObjectValues(data);
        
        // Write back to file with proper formatting
        const output = JSON.stringify(translatedData, null, 4);
        fs.writeFileSync(filePath, output, 'utf8');
        
        console.log(`✓ Completed ${filePath}`);
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
    }
}

async function processDirectory(dirPath) {
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        
        if (file.isDirectory()) {
            await processDirectory(fullPath);
        } else if (file.name.endsWith('.json') && file.name.includes('zh_Hans')) {
            await processJsonFile(fullPath);
        }
    }
}

// Test Sugoi connection
async function testSugoiConnection() {
    try {
        const testTranslation = await translateWithSugoi('こんにちは');
        if (testTranslation && testTranslation !== 'こんにちは') {
            console.log('✓ Sugoi connection test successful:', testTranslation);
            return true;
        } else {
            console.error('❌ Sugoi returned original text, translation may not be working');
            return false;
        }
    } catch (error) {
        console.error('Failed to connect to Sugoi Offline Translator:', error.message);
        console.error('Make sure Sugoi is running on one of these ports:', SUGOI_PORTS.join(', '));
        return false;
    }
}

// Main execution
async function main() {
    const translationDir = path.join(__dirname, 'translation');
    
    if (!fs.existsSync(translationDir)) {
        console.error('Translation directory not found!');
        return;
    }
    
    console.log('Testing Sugoi Offline Translator connection...');
    const connected = await testSugoiConnection();
    
    if (!connected) {
        console.error('\n❌ Cannot connect to Sugoi Offline Translator.');
        console.error('Please make sure:');
        console.error('1. Sugoi Offline Translator server is running');
        console.error(`2. It is accessible at http://localhost:${SUGOI_PORTS.join(' or ')}`);
        console.error('3. The API endpoint is /translate');
        console.error('\nYou can also modify SUGOI_PORTS in the script if your server uses a different port.');
        return;
    }
    
    console.log('\n✓ Connected to Sugoi!');
    console.log('Starting translation process...');
    console.log('This will translate Japanese keys to English and replace Chinese values...\n');
    
    await processDirectory(translationDir);
    
    console.log('\n✓ All files processed!');
}

main().catch(console.error);

