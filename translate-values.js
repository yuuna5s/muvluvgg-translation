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
                // Preserve all special formatting (newlines, color/material tags, etc.)
                // Only split when \n is encountered, otherwise send whole line to Sugoi
                // Preserve %usernameusernameuserna% pattern and all %user...na% variations
                
                let finalTranslation;
                
                // Preserve ALL username patterns (%user...na% variations) by replacing with placeholder
                // This protects: %usernameusernameuserna%, %user...na%, etc.
                const usernamePattern = /%user[^%]*na%/gi;
                const usernamePlaceholder = '__USERNAME_PLACEHOLDER_XYZ123__';
                const usernameMatches = key.match(usernamePattern);
                const hasUsername = usernameMatches && usernameMatches.length > 0;
                const keyWithPlaceholder = key.replace(usernamePattern, usernamePlaceholder);
                
                // If key contains newlines, split and translate each part separately
                if (keyWithPlaceholder.includes('\n')) {
                    const originalParts = keyWithPlaceholder.split('\n');
                    const translatedParts = [];
                    
                    for (let i = 0; i < originalParts.length; i++) {
                        const part = originalParts[i];
                        if (part.trim()) {
                            // Send the whole part to Sugoi (including any tags like <color=...>)
                            let translated = await translateWithSugoi(part);
                            
                            // Clean up unwanted HTML artifacts that Sugoi might add
                            // But preserve color/material tags
                            translated = translated
                                .replace(/<br\s*\/?>/gi, '')  // Remove <br> tags
                                .replace(/<b>/gi, '')         // Remove <b> tags
                                .replace(/<\/b>/gi, '')       // Remove </b> tags
                                .trim();
                            
                            // Restore username placeholder - replace with correct pattern
                            // Use global replace to handle multiple occurrences
                            translated = translated.replace(new RegExp(usernamePlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '%usernameusernameuserna%');
                            
                            translatedParts.push(translated);
                        } else {
                            // Preserve empty lines
                            translatedParts.push('');
                        }
                        
                        // Small delay between translations
                        if (i < originalParts.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 50));
                        }
                    }
                    
                    // Join with \n to preserve exact structure
                    finalTranslation = translatedParts.join('\n');
                    
                    // Also protect against any %user...na% patterns that might have been introduced by translation
                    // This ensures we catch any variations that might have been created
                    finalTranslation = finalTranslation.replace(/%user[^%]*na%/gi, '%usernameusernameuserna%');
                    
                    // Normalize curly quotes/apostrophes to straight ones
                    // Replace all curly apostrophe variations (U+2019, U+2018, U+201B, U+201A)
                    finalTranslation = finalTranslation
                        .replace(/[\u2019\u2018\u201B\u201A]/g, "'")  // Replace all curly apostrophe variations
                        .replace(/[\u201C\u201E\u201F]/g, '"')   // Replace left double quotes
                        .replace(/[\u201D\u201C]/g, '"');    // Replace right double quotes
                } else {
                    // No newlines, send whole key to Sugoi (including any tags)
                    finalTranslation = await translateWithSugoi(keyWithPlaceholder);
                    
                    // Clean up unwanted HTML artifacts (but preserve color/material tags)
                    finalTranslation = finalTranslation
                        .replace(/<br\s*\/?>/gi, '')
                        .replace(/<b>/gi, '')
                        .replace(/<\/b>/gi, '')
                        .trim();
                    
                    // Restore username placeholder - replace with correct pattern
                    // Use global replace to handle multiple occurrences
                    if (hasUsername) {
                        finalTranslation = finalTranslation.replace(new RegExp(usernamePlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '%usernameusernameuserna%');
                    }
                    
                    // Also protect against any %user...na% patterns that might have been introduced by translation
                    // This ensures we catch any variations that might have been created
                    finalTranslation = finalTranslation.replace(/%user[^%]*na%/gi, '%usernameusernameuserna%');
                    
                    // Normalize curly quotes/apostrophes to straight ones
                    // Replace all curly apostrophe variations (U+2019, U+2018, U+201B, U+201A)
                    finalTranslation = finalTranslation
                        .replace(/[\u2019\u2018\u201B\u201A]/g, "'")  // Replace all curly apostrophe variations
                        .replace(/[\u201C\u201E\u201F]/g, '"')   // Replace left double quotes
                        .replace(/[\u201D\u201C]/g, '"');    // Replace right double quotes
                }
                
                result[key] = finalTranslation;
                
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

// Tracking file to store list of translated files
const TRACKING_FILE = path.join(__dirname, 'translated-files.json');

// Load list of translated files
function loadTranslatedFiles() {
    try {
        if (fs.existsSync(TRACKING_FILE)) {
            const content = fs.readFileSync(TRACKING_FILE, 'utf8');
            return new Set(JSON.parse(content));
        }
    } catch (error) {
        console.warn('Could not load tracking file:', error.message);
    }
    return new Set();
}

// Save list of translated files
function saveTranslatedFiles(translatedFiles) {
    try {
        const fileArray = Array.from(translatedFiles);
        fs.writeFileSync(TRACKING_FILE, JSON.stringify(fileArray, null, 2), 'utf8');
    } catch (error) {
        console.error('Could not save tracking file:', error.message);
    }
}

// Check if file is already translated
function isFileTranslated(filePath, translatedFiles) {
    // Normalize path for cross-platform compatibility
    const normalizedPath = path.relative(__dirname, filePath).replace(/\\/g, '/');
    return translatedFiles.has(normalizedPath);
}

// Mark file as translated
function markFileAsTranslated(filePath, translatedFiles) {
    const normalizedPath = path.relative(__dirname, filePath).replace(/\\/g, '/');
    translatedFiles.add(normalizedPath);
}

async function processJsonFile(filePath, translatedFiles) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        
        // Skip if already translated (check tracking file)
        if (isFileTranslated(filePath, translatedFiles)) {
            return false; // Return false to indicate file was skipped
        }
        
        // Also check for old __translated__ marker for backward compatibility
        if (data['__translated__'] === 'true' || data['__translated__'] === true) {
            // Mark in tracking file and skip
            markFileAsTranslated(filePath, translatedFiles);
            return false;
        }
        
        console.log(`Processing ${filePath}...`);
        
        // Remove __translated__ marker if it exists (to avoid processing issues)
        const hasMarker = data.hasOwnProperty('__translated__');
        if (hasMarker) {
            delete data['__translated__'];
        }
        
        // Translate all values (keeping keys as Japanese)
        const translatedData = await translateObjectValues(data);
        
        // Write back to file with proper formatting (no marker added)
        const output = JSON.stringify(translatedData, null, 4);
        fs.writeFileSync(filePath, output, 'utf8');
        
        // Mark as translated in tracking file
        markFileAsTranslated(filePath, translatedFiles);
        
        console.log(`✓ Completed ${filePath}`);
        return true; // Return true to indicate file was processed
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
        return false;
    }
}

async function processDirectory(dirPath, maxFiles = null, stats = { processed: 0, skipped: 0 }, translatedFiles) {
    // If we've reached the limit, stop processing
    if (maxFiles !== null && stats.processed >= maxFiles) {
        return stats;
    }
    
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const file of files) {
        // If we've reached the limit, stop processing
        if (maxFiles !== null && stats.processed >= maxFiles) {
            break;
        }
        
        const fullPath = path.join(dirPath, file.name);
        
        if (file.isDirectory()) {
            await processDirectory(fullPath, maxFiles, stats, translatedFiles);
        } else if (file.name.endsWith('.json') && file.name.includes('zh_Hans')) {
            // Check if file is already translated
            if (isFileTranslated(fullPath, translatedFiles)) {
                stats.skipped++;
                continue; // Skip already translated files
            }
            
            // Also check for old __translated__ marker for backward compatibility
            try {
                const content = fs.readFileSync(fullPath, 'utf8');
                const data = JSON.parse(content);
                
                if (data['__translated__'] === 'true' || data['__translated__'] === true) {
                    // Mark in tracking file and skip
                    markFileAsTranslated(fullPath, translatedFiles);
                    stats.skipped++;
                    continue;
                }
            } catch (error) {
                // If we can't read the file, skip it
                continue;
            }
            
            // Process the file
            const wasProcessed = await processJsonFile(fullPath, translatedFiles);
            if (wasProcessed) {
                stats.processed++;
                // Save tracking file periodically (every 10 files)
                if (stats.processed % 10 === 0) {
                    saveTranslatedFiles(translatedFiles);
                }
            } else {
                stats.skipped++;
            }
        }
    }
    
    return stats;
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
    
    // Check for command line arguments for max number of files to process
    let maxFiles = null;
    const args = process.argv.slice(2);
    if (args.length >= 1) {
        const fileCount = parseInt(args[0]);
        if (!isNaN(fileCount) && fileCount > 0) {
            maxFiles = fileCount;
            console.log(`\n📋 Will process up to ${maxFiles} files (skipping already translated files)\n`);
        } else {
            console.error('Invalid file count. Usage: node translate-values.js [maxFiles]');
            console.error('Example: node translate-values.js 100');
            return;
        }
    }
    
    console.log('Testing Sugoi Offline Translator connection...');
    const connected = await testSugoiConnection();
    
    if (!connected) {
        console.error('\n❌ Cannot connect to Sugoi Offline Translator.');
        console.error('Please make sure:');
        console.error('1. Sugoi Offline Translator server is running');
        console.error(`2. It is accessible at http://localhost:${SUGOI_PORTS.join(' or ')}`);
        console.error('3. The API endpoint is / (root)');
        console.error('\nYou can also modify SUGOI_PORTS in the script if your server uses a different port.');
        return;
    }
    
    console.log('\n✓ Connected to Sugoi!');
    console.log('Starting translation process...');
    if (maxFiles) {
        console.log(`This will translate up to ${maxFiles} files (skipping already translated)...\n`);
    } else {
        console.log('This will translate all files (skipping already translated)...\n');
    }
    
    // Load tracking file
    const translatedFiles = loadTranslatedFiles();
    console.log(`Found ${translatedFiles.size} files already marked as translated in tracking file.\n`);
    
    const stats = { processed: 0, skipped: 0 };
    await processDirectory(translationDir, maxFiles, stats, translatedFiles);
    
    // Save tracking file at the end
    saveTranslatedFiles(translatedFiles);
    
    console.log('\n✓ Translation process completed!');
    console.log(`  Processed: ${stats.processed} files`);
    console.log(`  Skipped (already translated): ${stats.skipped} files`);
    if (maxFiles && stats.processed >= maxFiles) {
        console.log(`  Reached limit of ${maxFiles} files`);
    }
    console.log(`\nTracking file: ${TRACKING_FILE} (can be committed to git)`);
}

main().catch(console.error);


