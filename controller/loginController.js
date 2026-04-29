import { getSaltAndHash } from "../storage/loginStorage.js";
import { passwordChecker } from "../middleware/passwordChecker.js";

export async function loginCheck(req,res){
    const { username, password } = req.body;

    try {
        let usernameResult = await getSaltAndHash(username);

        if (usernameResult === 'Invalid credentials') {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
            return;
        } else if (usernameResult === 'Server error') {
            res.status(500).json({ success: false, message: 'Server error' });
            return;
        } else {
            // Login successful - result contains user data
            const saltHex=usernameResult.saltHex;
            const storedHash=usernameResult.storedHash;
            const passwordResult=passwordChecker(saltHex,storedHash,password);

            if (passwordResult === 'Invalid credentials') {
                res.status(401).json({ success: false, message: 'Invalid credentials' });
                return;
            } else if (passwordResult === 'Server error') {
                res.status(500).json({ success: false, message: 'Server error' });
                return;
            } else {
                // Login successful - result contains user data

                res.status(200).json({ 
                    success: true, 
                    message: 'Login successful', 
                    user: usernameResult.row.slice(0,6),
                    admin: usernameResult.admin
                });
            }

        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }


}