const fs = require('fs');
const path = require('path');
const http = require('http');

// Sugoi API configuration
const SUGOI_PORT = 14366;

function translateWithSugoi(japaneseText) {
    return new Promise((resolve) => {
        if (!japaneseText || japaneseText.trim() === '') {
            resolve(japaneseText);
            return;
        }

        const postData = JSON.stringify({
            message: 'translate sentences',
            content: japaneseText
        });

        const options = {
            hostname: 'localhost',
            port: SUGOI_PORT,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 60000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve(typeof result === 'string' ? result : JSON.stringify(result));
                } catch (error) {
                    resolve(japaneseText);
                }
            });
        });

        req.on('error', () => resolve(japaneseText));
        req.on('timeout', () => {
            req.destroy();
            resolve(japaneseText);
        });

        req.write(postData);
        req.end();
    });
}

async function fixFileNewlines(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        
        let fixed = false;
        const fixedData = {};
        
        for (const [key, value] of Object.entries(data)) {
            if (key === '__translated__') {
                fixedData[key] = value;
                continue;
            }
            
            // Check if original key has \n but translation doesn't
            if (key.includes('\n') && typeof value === 'string') {
                // Replace HTML tags with \n
                let fixedValue = value
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<b>/gi, '\n')
                    .replace(/<\/b>/gi, '')
                    .replace(/\n\s*\n/g, '\n');
                
                const originalNewlineCount = (key.match(/\n/g) || []).length;
                const valueNewlineCount = (fixedValue.match(/\n/g) || []).length;
                
                // If still missing newlines, retranslate each part
                if (originalNewlineCount > 0 && valueNewlineCount === 0) {
                    console.log(`  Fixing: "${key.substring(0, 50)}..."`);
                    const originalParts = key.split('\n');
                    const translatedParts = [];
                    for (const part of originalParts) {
                        if (part.trim()) {
                            const translated = await translateWithSugoi(part.trim());
                            translatedParts.push(translated);
                            await new Promise(r => setTimeout(r, 100)); // Small delay
                        } else {
                            translatedParts.push('');
                        }
                    }
                    fixedValue = translatedParts.join('\n');
                    fixed = true;
                } else if (fixedValue !== value) {
                    fixed = true;
                }
                
                fixedData[key] = fixedValue;
            } else {
                fixedData[key] = value;
            }
        }
        
        if (fixed) {
            const output = JSON.stringify(fixedData, null, 4);
            fs.writeFileSync(filePath, output, 'utf8');
            return true;
        }
        return false;
    } catch (error) {
        console.error(`Error fixing ${filePath}:`, error.message);
        return false;
    }
}

async function processDirectory(dirPath) {
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    let fixedCount = 0;
    
    for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        
        if (file.isDirectory()) {
            const subFixed = await processDirectory(fullPath);
            fixedCount += subFixed;
        } else if (file.name.endsWith('.json') && file.name.includes('zh_Hans')) {
            const wasFixed = await fixFileNewlines(fullPath);
            if (wasFixed) {
                fixedCount++;
                console.log(`✓ Fixed: ${fullPath}`);
            }
        }
    }
    
    return fixedCount;
}

async function main() {
    const translationDir = path.join(__dirname, 'translation');
    console.log('Fixing newlines in translated files...\n');
    
    const fixedCount = await processDirectory(translationDir);
    console.log(`\n✓ Fixed ${fixedCount} files`);
}

main().catch(console.error);

