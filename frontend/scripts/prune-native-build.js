const fs = require("fs");
const path = require("path");

const buildRoot = path.resolve(__dirname, "..", "build");
const developerOnlyAssets = ["razorpay-test.html"];

for (const asset of developerOnlyAssets) {
  const assetPath = path.join(buildRoot, asset);
  if (fs.existsSync(assetPath)) {
    fs.unlinkSync(assetPath);
    process.stdout.write(`Removed developer-only asset from native build: ${asset}\n`);
  }
}
