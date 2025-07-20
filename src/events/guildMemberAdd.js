const {
  ENVY_SERVER_ID,
  ENVY_BUYERS_SERVER_ID,
  VERIFIED_ROLE_ID,
  BUYERS_ROLE_ID,
  KEY_ROLE_IDS,
} = require("../config");

module.exports = {
  name: "guildMemberAdd",
  async execute(member) {
    if (member.guild.id !== ENVY_BUYERS_SERVER_ID) return;

    try {
      const envyGuild = await member.client.guilds.fetch(ENVY_SERVER_ID);
      const memberInEnvy = await envyGuild.members.fetch(member.id);

      const hasRequiredRole = KEY_ROLE_IDS.some((roleId) =>
        memberInEnvy.roles.cache.has(roleId)
      )  || memberInEnvy.roles.cache.has(BUYERS_ROLE_ID) || memberInEnvy.permissions.has("ADMINISTRATOR");

      if (hasRequiredRole) {
        await member.roles.add(VERIFIED_ROLE_ID);
      } else {
        await member.send(
          "You're not allowed in this server, purchase envy first then try again",
        );
        await member.kick("Does not have required roles in Envy server.");
      }
    } catch (error) {
      console.error(
        `Error processing guildMemberAdd for ${member.user.tag}:`,
        error,
      );
      // If we can't find the user in the main server, kick them.
      if (error.code === 10007) {
        try {
          await member.send(
            "You're not allowed in this server, purchase envy first then try again",
          );
          await member.kick("Not found in the main Envy server.");
        } catch (kickError) {
          console.error(`Failed to kick ${member.user.tag}:`, kickError);
        }
      }
    }
  },
};
