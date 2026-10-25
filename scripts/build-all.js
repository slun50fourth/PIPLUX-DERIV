const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const packages = [
    '@deriv/components',
    '@deriv/reports',
    '@deriv/trader',
    '@deriv/bot-skeleton',
    '@deriv/bot-web-ui',
    '@deriv/core',
];

const env = {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=4096`.trim(),
};

console.log('🚀 Starting PIPLUX-DERIV multi-package production build...');
console.log(`📦 Node Options: ${env.NODE_OPTIONS}\n`);

const startTime = Date.now();

for (const pkg of packages) {
    const pkgStart = Date.now();
    console.log(`🔨 Building workspace: ${pkg}...`);
    try {
        execSync(`npm run build --workspace=${pkg}`, {
            stdio: 'inherit',
            env,
        });
        const elapsed = ((Date.now() - pkgStart) / 1000).toFixed(1);
        console.log(`✅ Finished ${pkg} in ${elapsed}s\n`);
    } catch (err) {
        console.error(`❌ Build failed for workspace ${pkg}`);
        process.exit(1);
    }
}

// Copy packages/core/dist to ./dist for root deployment compatibility
const coreDist = path.resolve(__dirname, '..', 'packages', 'core', 'dist');
const rootDist = path.resolve(__dirname, '..', 'dist');

if (fs.existsSync(coreDist)) {
    console.log(`📂 Mirroring ${coreDist} -> ${rootDist}...`);
    if (fs.existsSync(rootDist)) {
        fs.rmSync(rootDist, { recursive: true, force: true });
    }
    fs.cpSync(coreDist, rootDist, { recursive: true });
    console.log('✅ Dist mirror complete.');
}

const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n🎉 All packages built and deployed successfully in ${totalElapsed}s!`);
