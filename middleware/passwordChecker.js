// PasswordChecker.js
import crypto from "crypto"

export function passwordChecker(saltHex,storedHash,password){
    const salt = Buffer.from(saltHex, "hex");

    const newHash = crypto
    .createHash("sha256")
    .update(Buffer.concat([salt, Buffer.from(password)]))
    .digest("hex");

    if (newHash === storedHash) {
        return true;
    } else {
        return false;
    }
}
