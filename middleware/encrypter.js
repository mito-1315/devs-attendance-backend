import crypto from "crypto";


export function encrypter(password) {
  const salt = crypto.randomBytes(16);

  const hash = crypto
    .createHash("sha256")
    .update(Buffer.concat([salt, Buffer.from(password)]))
    .digest("hex");

  return {
    salt: salt.toString("hex"),
    hash: hash
  };
}
