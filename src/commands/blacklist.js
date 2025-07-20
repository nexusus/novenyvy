const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const noblox = require("noblox.js");
const supabase = require("../supabaseClient");
const {
  GROUP_ID,
  ENVY_BUYERS_SERVER_ID,
  BLACKLISTED_LOGS_CHANNEL_ID,
  ENVY_SERVER_ID,
  BUYERS_ROLE_ID,
} = require("../config");

module.exports = {
  permissions: [PermissionFlagsBits.Administrator],
  data: new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Blacklist a Roblox user from the group and server.")
    .addStringOption((option) =>
      option
        .setName("envy_id")
        .setDescription("The Envy ID of the user to blacklist.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("The reason for the blacklist.")
        .setRequired(true),
    ),
  async execute(interaction) {
    const envyIdStr = interaction.options.getString("envy_id");
    const reason = interaction.options.getString("reason");
    const envyId = parseInt(envyIdStr, 10);

    if (isNaN(envyId)) {
      return interaction.editReply({
        content: "❌ Invalid Envy ID. Please provide a valid number.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Get the user's whitelist profile
      const { data: whitelist, error: fetchError } = await supabase
        .from("whitelists")
        .select("roblox_id, roblox_username, discord_id")
        .eq("envy_id", envyId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') { // Ignore 'single row not found' error
        throw fetchError;
      }

      if (!whitelist) {
        return interaction.editReply({
          content: "❌ This user does not have a whitelist profile. They cannot be blacklisted.",
        });
      }

      const { roblox_id: robloxIds, roblox_username: robloxUsernames, discord_id: discordId } = whitelist;

      // Exile all Roblox accounts from the group
      for (const robloxId of robloxIds) {
        if (robloxId) {
          await noblox.exile(GROUP_ID, robloxId);
        }
      }

      // Add a single entry to the blacklist table with arrays
      const { error: blacklistError } = await supabase.from("blacklists").insert([
        {
          roblox_id: robloxIds,
          roblox_username: robloxUsernames,
          discord_id: discordId,
          envy_id: envyId,
          reason: reason,
          blacklisted_by: interaction.user.id,
        },
      ]);

      if (blacklistError) throw blacklistError;

      // Remove from whitelist
      const { error: deleteError } = await supabase
        .from("whitelists")
        .delete()
        .eq("envy_id", envyId);

      if (deleteError) {
        // Optional: Handle case where deletion fails but blacklist insertion succeeded
        console.error("Failed to delete from whitelist, but user was blacklisted:", deleteError);
        // Decide if you want to throw or just log
      }

      // Kick from Envy Buyers server and send DM
      if (discordId) {
        const buyersGuild = await interaction.client.guilds.fetch(ENVY_BUYERS_SERVER_ID);
        try {
          const member = await buyersGuild.members.fetch(discordId);
          if (member && !member.permissions.has(PermissionFlagsBits.Administrator)) {
            const blacklistEmbed = new EmbedBuilder()
              .setTitle("You Have Been Blacklisted")
              .setDescription(`You have been blacklisted from Envy Serverside for the following reason: **${reason}**`)
              .setColor("#ff008c")
              .setFooter({ text: "Envy Blacklist System" })
              .setTimestamp();
            
            await member.send({ embeds: [blacklistEmbed] }).catch(console.error);
            await member.kick(`Blacklisted by ${interaction.user.tag}: ${reason}`);
          }
        } catch (error) {
          console.error(`Could not kick user ${discordId} from Envy Buyers server:`, error);
        }
      }

      // Remove Buyer role in main server if it exists
      if (ENVY_SERVER_ID) {
        const envyGuild = await interaction.client.guilds.fetch(ENVY_SERVER_ID);
        try {
          const memberInEnvy = await envyGuild.members.fetch(discordId);
          if (memberInEnvy && memberInEnvy.roles.cache.has(BUYERS_ROLE_ID)) {
            await memberInEnvy.roles.remove(BUYERS_ROLE_ID);
          }
        } catch (error) {
          console.error(`Could not remove Buyer role from user ${discordId} in main server:`, error);
        }
      }

      // Log the blacklist
      const logEmbed = new EmbedBuilder()
        .setAuthor({
          name: "Envy Watcher | User Blacklisted",
          iconURL: interaction.guild.iconURL(),
        })
        .setTitle(`Blacklisted User: ${robloxUsernames.join(", ")}`)
        .setColor("#ff008c")
        .addFields(
          { name: "Envy ID", value: `\`${envyId}\``, inline: true },
          { name: "Linked Discord", value: `<@${discordId}>`, inline: true },
          { name: "Reason", value: reason },
          { name: "Blacklisted By", value: interaction.user.tag, inline: true },
        )
        .setFooter({ text: "Envy -> Blacklisted", iconURL: interaction.guild.iconURL() })
        .setTimestamp();

      const logChannel = await interaction.client.channels.fetch(BLACKLISTED_LOGS_CHANNEL_ID);
      if (logChannel) {
        await logChannel.send({ embeds: [logEmbed] });
      }

      return interaction.editReply({
        content: `✅ Successfully blacklisted all accounts associated with Envy ID **${envyId}**.`,
      });
    } catch (err) {
      console.error("Error blacklisting user:", err);
      return interaction.editReply({
        content: "❌ Could not blacklist user: " + err.message,
      });
    }
  },
};
