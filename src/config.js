require("dotenv").config();

module.exports = {
  COOKIE: process.env.ROBLOX_COOKIE,
  TOKEN: process.env.DISCORD_TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  GUILD_ID: process.env.GUILD_ID,
  GROUP_ID: parseInt(process.env.GROUP_ID),
  BUYERS_ROLE_ID: process.env.BUYERS_ROLE_ID,
  NORMAL_KEY_ROLE_ID: process.env.NORMAL_KEY_ROLE_ID,
  WHITELISTED_LOGS_CHANNEL_ID: process.env.WHITELISTED_LOGS_CHANNEL_ID,
  BLACKLISTED_LOGS_CHANNEL_ID: process.env.BLACKLISTED_LOGS_CHANNEL_ID,
  ENVY_SERVER_ID: process.env.ENVY_SERVER_ID,
  ENVY_BUYERS_SERVER_ID: process.env.ENVY_BUYERS_SERVER_ID,
  VERIFIED_ROLE_ID: process.env.VERIFIED_ROLE_ID,
  KEY_ROLE_IDS: process.env.KEY_ROLE_IDS
    ? process.env.KEY_ROLE_IDS.split(",")
    : [],
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
};
