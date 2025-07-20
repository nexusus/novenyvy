const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const supabase = require("../supabaseClient");
const noblox = require("noblox.js");
const { GROUP_ID } = require("../config");

module.exports = {
  permissions: [PermissionFlagsBits.Administrator],
  data: new SlashCommandBuilder()
    .setName("check")
    .setDescription("Check a user's whitelist status.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The Discord user to check.")
        .setRequired(true),
    ),
  async execute(interaction) {
    const user = interaction.options.getUser("user");

    await interaction.deferReply({ ephemeral: true });

    try {
      const { data: whitelist, error } = await supabase
        .from("whitelists")
        .select("envy_id, roblox_username, roblox_id")
        .eq("discord_id", user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (!whitelist || whitelist.roblox_id.length === 0) {
        return interaction.editReply({
          content: `❌ **${user.tag}** has no whitelisted accounts.`,
          ephemeral: true,
        });
      }

      const { envy_id, roblox_username, roblox_id } = whitelist;

      // Check group membership for all accounts and prepare display strings
      let inGroupUsernames = [];
      let notInGroupUsernames = [];
      let stillInGroup = false;

      for (let i = 0; i < roblox_id.length; i++) {
        const id = roblox_id[i];
        const username = roblox_username[i];
        const isMember = await noblox.getRankInGroup(GROUP_ID, parseInt(id, 10)) > 0;

        if (isMember) {
          inGroupUsernames.push(`- \`${username}\` (${id})`);
          stillInGroup = true;
        } else {
          notInGroupUsernames.push(username);
        }
      }

      // If user has left the group on all accounts, remove them completely
      if (!stillInGroup) {
        await supabase.from("whitelists").delete().eq("discord_id", user.id);
        return interaction.editReply({
          content: `**${user.tag}** was removed from the whitelist because they are no longer in the Roblox group on any of their accounts.`,
          ephemeral: true,
        });
      }
      
      // If some accounts left, update the record to remove them
      if (notInGroupUsernames.length > 0) {
        const updatedIds = [];
        const updatedUsernames = [];
        for (let i = 0; i < roblox_id.length; i++) {
          if (!notInGroupUsernames.includes(roblox_username[i])) {
            updatedIds.push(roblox_id[i]);
            updatedUsernames.push(roblox_username[i]);
          }
        }
        await supabase
          .from("whitelists")
          .update({ roblox_id: updatedIds, roblox_username: updatedUsernames })
          .eq("discord_id", user.id);
      }

      const embed = new EmbedBuilder()
        .setTitle(`Whitelist Status for ${user.tag}`)
        .setColor("#7b06e9")
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: "Envy ID", value: `\`${envy_id}\`` },
          { name: "Whitelisted Accounts", value: inGroupUsernames.join("\n") || "None" }
        )
        .setTimestamp();
      
      if (notInGroupUsernames.length > 0) {
        embed.addFields({
            name: "Accounts Removed (Left Group)",
            value: notInGroupUsernames.map(u => `\`${u}\``).join(", ")
        });
      }

      return interaction.editReply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      console.error("Error checking user:", err);
      return interaction.editReply({
        content: "❌ Could not check user: " + err.message,
        ephemeral: true,
      });
    }
  },
};
