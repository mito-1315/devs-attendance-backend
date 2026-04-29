import { checkIfUserExist, addUser } from "../storage/createUserStorage.js"
import { encrypter } from "../middleware/encrypter.js";

export async function createUser(req,res){
    const { username, name, roll_number, department, team, role, password } = req.body;

    try {
        const existingUser = await checkIfUserExist(username);

        if(existingUser===true){
            res.status(401).json({ success: false, message: 'Username already exists' });
            return;
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }    const encrypterResult = encrypter(password);
    const salt = encrypterResult.salt;
    const hash = encrypterResult.hash;

    try {
        const result = await addUser(username, name, roll_number, department, team, role, hash, salt);

        if(result === true){
            res.status(201).json({ 
                success: true, 
                message: 'User created successfully'
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'Failed to create user'
            });
        }
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }

}