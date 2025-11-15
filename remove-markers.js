const fs = require('fs');
const path = require('path');

function removeMarker(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        
        // Remove the __translated__ marker if it exists
        if (data.hasOwnProperty('__translated__')) {
            delete data['__translated__'];
            
            // Write back to file
            const output = JSON.stringify(data, null, 4);
            fs.writeFileSync(filePath, output, 'utf8');
            return true;
        }
        return false;
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
        return false;
    }
}

function processDirectory(dirPath) {
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    let removedCount = 0;
    
    for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        
        if (file.isDirectory()) {
            const subRemoved = processDirectory(fullPath);
            removedCount += subRemoved;
        } else if (file.name.endsWith('.json') && file.name.includes('zh_Hans')) {
            if (removeMarker(fullPath)) {
                removedCount++;
                if (removedCount % 10 === 0) {
                    console.log(`Removed markers from ${removedCount} files...`);
                }
            }
        }
    }
    
    return removedCount;
}

const translationDir = path.join(__dirname, 'translation');
console.log('Removing __translated__ markers from all JSON files...\n');

const removedCount = processDirectory(translationDir);

console.log(`\n✓ Removed markers from ${removedCount} files`);

