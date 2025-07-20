const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const noblox = require("noblox.js");
const supabase = require("../supabaseClient");
const { ENVY_BUYERS_SERVER_ID, BLACKLISTED_LOGS_CHANNEL_ID } = require("../config");

module.exports = {
  permissions: [PermissionFlagsBits.Administrator],
  data: new SlashCommandBuilder()
    .setName("unblacklist")
    .setDescription("Unblacklist a Roblox user.")
    .addStringOption((option) =>
      option
        .setName("envy_id")
        .setDescription("The Envy ID to unblacklist.")
        .setRequired(true),
    ),
  async execute(interaction) {
    const envyIdStr = interaction.options.getString("envy_id");
    const envyId = parseInt(envyIdStr, 10);

    if (isNaN(envyId)) {
      return interaction.reply({
        content: "❌ Invalid Envy ID. Please provide a valid number.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Get blacklist data
      const { data: blacklistData, error: fetchError } = await supabase
        .from("blacklists")
        .select("discord_id, roblox_username")
        .eq("envy_id", envyId)
        .single();

      if (fetchError || !blacklistData) {
        return interaction.editReply({
          content: `❌ Envy ID **${envyId}** is not on the blacklist.`,
          ephemeral: true,
        });
      }

      // Remove from blacklist table
      const { error: deleteError } = await supabase
        .from("blacklists")
        .delete()
        .eq("envy_id", envyId);

      if (deleteError) throw deleteError;

      // Unban from Envy Buyers server
      if (blacklistData.discord_id) {
        const buyersGuild = await interaction.client.guilds.fetch(
          ENVY_BUYERS_SERVER_ID,
        );
        try {
          await buyersGuild.bans.remove(
            blacklistData.discord_id,
            `Unblacklisted by ${interaction.user.tag}`,
          );
        } catch (error) {
          // Ignore if the user wasn't banned
          if (error.code !== 10026) {
            throw error;
          }
        }
      }

      // Log the unblacklist
      const logEmbed = new EmbedBuilder()
        .setAuthor({
          name: "Envy Watcher | User Unblacklisted",
          iconURL: interaction.guild.iconURL(),
        })
        .setTitle(`Unblacklisted User: ${blacklistData.roblox_username.join(", ")}`)
        .setColor("#00ff00")
        .addFields(
          { name: "Envy ID", value: `\`${envyId}\``, inline: true },
          { name: "Linked Discord", value: `<@${blacklistData.discord_id}>`, inline: true },
          { name: "Unblacklisted By", value: interaction.user.tag, inline: true },
        )
        .setFooter({ text: "Envy -> Unblacklisted", iconURL: interaction.guild.iconURL() })
        .setTimestamp();

      const logChannel = await interaction.client.channels.fetch(BLACKLISTED_LOGS_CHANNEL_ID);
      if (logChannel) {
        await logChannel.send({ embeds: [logEmbed] });
      }

      return interaction.editReply({
        content: `✅ Successfully unblacklisted Envy ID **${envyId}**.`,
      });
    } catch (err) {
      console.error("Error unblacklisting user:", err);
      return interaction.editReply({
        content: "❌ Could not unblacklist user: " + err.message,
      });
    }
  },
};
