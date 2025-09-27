import { readFileSync, writeFileSync } from "fs";

// Read the package.json file
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const currentVersion = packageJson.version;

// Get minAppVersion from manifest.json
let minAppVersion = "0.15.0"; // Default value
try {
  const manifestJson = JSON.parse(readFileSync("manifest.json", "utf8"));
  minAppVersion = manifestJson.minAppVersion || minAppVersion;
  
  // Update manifest.json version
  manifestJson.version = currentVersion;
  writeFileSync("manifest.json", JSON.stringify(manifestJson, null, 2));
  console.log(`Updated manifest.json version to ${currentVersion}`);
} catch (error) {
  console.error("Could not update manifest.json", error);
  process.exit(1);
}

// Check if versions.json exists, update it or create it
try {
  let versionsJson = {};
  try {
    versionsJson = JSON.parse(readFileSync("versions.json", "utf8"));
  } catch {
    // File doesn't exist yet, that's OK
  }
  
  versionsJson[currentVersion] = minAppVersion;
  
  writeFileSync("versions.json", JSON.stringify(versionsJson, null, 2));
  console.log(`Updated versions.json for version ${currentVersion}`);
} catch (error) {
  console.error("Could not update versions.json", error);
  process.exit(1);
}
