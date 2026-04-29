import { getUserProfile, getUserSessions, closeSession } from "../storage/profileStorage.js";

/**
 * Get user profile from ATTENDANCE_SHEET
 */
export async function getProfile(req, res) {  const { username } = req.body;

  if (!username) {
    return res.status(400).json({
      success: false,
      message: 'Username is required'
    });
  }

  try {
    // Fetch user profile data
    const profileResult = await getUserProfile(username);

    if (!profileResult.found) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      user: profileResult.user
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
}

/**
 * Close a session by setting status=Complete and recording closed_at
 */
export async function closeSessionController(req, res) {
  const { username, sheet_id } = req.body;

  if (!username || !sheet_id) {
    return res.status(400).json({
      success: false,
      message: 'Username and sheet_id are required'
    });
  }

  try {
    const result = await closeSession(username, sheet_id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }

    res.status(200).json({
      success: true,
      message: 'Session closed successfully',
      closed_at: result.closed_at
    });
  } catch (error) {
    console.error('Error closing session:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
}
export async function getSession(req, res) {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({
      success: false,
      message: 'Username is required'
    });
  }

  try {
    // Fetch user sessions
    const sessions = await getUserSessions(username);

    res.status(200).json({
      success: true,
      sessions: sessions
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
}
