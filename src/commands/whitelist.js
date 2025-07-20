const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const noblox = require("noblox.js");
const supabase = require("../supabaseClient");
const {
  GROUP_ID,
  BUYERS_ROLE_ID,
  KEY_ROLE_IDS,
  WHITELISTED_LOGS_CHANNEL_ID,
} = require("../config");

async function cleanupAndWhitelist(interaction, robloxId, robloxUsername) {
  try {
    // --- Database Cleanup ---
    // 1. Find all profiles containing the roblox_id
    const { data: profiles, error: findError } = await supabase
      .from("whitelists")
      .select("discord_id, roblox_id, roblox_username")
      .contains("roblox_id", [robloxId]);

    if (findError) {
      console.error("Error finding profiles for cleanup:", findError);
      return;
    }

    // 2. Remove the roblox_id from all found profiles
    if (profiles && profiles.length > 0) {
      for (const profile of profiles) {
        const updatedRobloxIds = profile.roblox_id.filter(id => id !== robloxId);
        const updatedRobloxUsernames = profile.roblox_username.filter(name => name.toLowerCase() !== robloxUsername.toLowerCase());

        const { error: cleanupError } = await supabase
          .from("whitelists")
          .update({ roblox_id: updatedRobloxIds, roblox_username: updatedRobloxUsernames })
          .eq("discord_id", profile.discord_id);

        if (cleanupError) {
          console.error(`Error cleaning up profile for ${profile.discord_id}:`, cleanupError);
        }
      }
    }

    // --- Add to New Profile ---
    const member = interaction.member;

    // 3. Get the target user's current profile
    const { data: existingWhitelist, error: existingError } = await supabase
      .from("whitelists")
      .select("*")
      .eq("discord_id", member.id)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      throw existingError;
    }
    
    let envyId;
    if (existingWhitelist) {
      // 4a. User exists, update their record ensuring no duplicates
      const idSet = new Set(existingWhitelist.roblox_id);
      idSet.add(robloxId);
      const usernameSet = new Set(existingWhitelist.roblox_username.map(u => u.toLowerCase()));
      usernameSet.add(robloxUsername.toLowerCase());
      
      const finalIds = Array.from(idSet);
      const finalUsernames = Array.from(usernameSet);


      const { error: updateError } = await supabase
        .from("whitelists")
        .update({ roblox_id: finalIds, roblox_username: finalUsernames })
        .eq("discord_id", member.id);

      if (updateError) throw updateError;
      envyId = existingWhitelist.envy_id;
    } else {
      // 4b. New user, insert a new record
      const { data, error } = await supabase
        .from("whitelists")
        .insert([
          {
            discord_id: member.id,
            roblox_id: [robloxId],
            roblox_username: [robloxUsername],
          },
        ])
        .select()
        .single();

      if (error) throw error;
      envyId = data.envy_id;
    }

    // --- Logging ---
    const playerInfo = await noblox.getPlayerInfo(robloxId);
    const embed = new EmbedBuilder()
      .setAuthor({
        name: `Envy Watcher | ${existingWhitelist ? 'Whitelist Updated' : 'New Whitelisted User'} -> ${envyId}`,
        iconURL: interaction.guild.iconURL(),
      })
      .setTitle(robloxUsername).setURL(`https://www.roblox.com/users/${robloxId}/profile`)
      .setColor("#7f00d4")
      .addFields(
        { name: "> **Discord Info**:", value: `**Discord Name**: \`${interaction.member.displayName}\` aka \`${interaction.user.tag}\`\n**Discord ID**: \`${interaction.user.id}\`\n**Joined Envy At**: <t:${Math.floor(interaction.member.joinedTimestamp / 1000)}:f>\n**Joined Discord At**: <t:${Math.floor(interaction.user.createdTimestamp / 1000)}:f>`, inline: true },
        { name: "> **Roblox Info**:", value: `**Roblox Username**: \`${robloxUsername}\`\n**Roblox ID**: \`${robloxId.toString()}\`\n**Display name**: ${playerInfo.displayName}\n**Age**: ${playerInfo.age}\n**Account Creation Date**: <t:${Math.floor(playerInfo.joinDate.getTime() / 1000)}:f>`, inline: true }
      )
      .setFooter({
        text: "Envy -> Whitelisted",
        iconURL: interaction.guild.iconURL(),
      })
    const thumbnails = await noblox.getPlayerThumbnail(robloxId, 420, "png", false, "Headshot");
    if (thumbnails && thumbnails[0] && thumbnails[0].imageUrl) {
      embed.setThumbnail(thumbnails[0].imageUrl);
    }
    embed.setTimestamp();

    const logChannel = await interaction.client.channels.fetch(
      WHITELISTED_LOGS_CHANNEL_ID,
    );
    if (logChannel) {
      await logChannel.send({ embeds: [embed] });
    }

  } catch (err) {
    console.error("Error during async cleanup and whitelist:", err);
  }
}


module.exports = {
  permissions: [...KEY_ROLE_IDS],
  data: new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Whitelist a Roblox user in the group.")
    .addStringOption((option) =>
      option
        .setName("username")
        .setDescription("The Roblox username to whitelist.")
        .setRequired(true),
    ),
  async execute(interaction) {
    const username = interaction.options.getString("username");
    const member = interaction.member;

    // We must defer otherwise the interaction token expires
    await interaction.deferReply({ ephemeral: true });

    try {
      // --- Initial Checks ---
      const robloxId = await noblox.getIdFromUsername(username);
      if (!robloxId) {
        return interaction.editReply({ content: `❌ Could not find a Roblox user with the username **${username}**.` });
      }
      const robloxUsername = await noblox.getUsernameFromId(robloxId);

      // Check if user is blacklisted
      const { data: blacklist, error: blacklistError } = await supabase
        .from("blacklists")
        .select("reason, blacklisted_by")
        .or(`roblox_id.cs.{${robloxId}},roblox_username.cs.{"${robloxUsername}"}`);
      
      if (blacklistError) throw blacklistError;

      if (blacklist && blacklist.length > 0) {
        const blacklistedBy = await interaction.client.users.fetch(blacklist[0].blacklisted_by);
        const blacklistEmbed = new EmbedBuilder()
          .setTitle("❌ Whitelist Failed: User is Blacklisted")
          .setColor("#ff008c")
          .addFields(
            { name: "**Roblox User**:", value: `\`${robloxUsername}\`` },
            { name: "**Reason**:", value: blacklist[0].reason },
            { name: "**Blacklisted By**:", value: blacklistedBy ? blacklistedBy.tag : "Unknown" }
          )
          .setFooter({ text: "This user cannot be whitelisted until they are unblacklisted." })
          .setTimestamp();
        return interaction.editReply({ embeds: [blacklistEmbed] });
      }

      // --- Handle Join Request ---
      const response = await noblox.getJoinRequests({ group: GROUP_ID });
      const request = response.data.find(
        (req) => req.requester.userId === robloxId,
      );

      if (!request) {
        return interaction.editReply({
          content: `❌ Could not find a join request for **${robloxUsername}**. Please ensure the user has requested to join the group.`,
        });
      }

      await noblox.handleJoinRequest(GROUP_ID, robloxId, true);

      // --- Give Immediate Feedback ---
      const replyOptions = {};
      if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        replyOptions.content = `[✅] Successfully whitelisted **${robloxUsername}**.`;
      } else {
        replyOptions.content = `[✅] You have been successfully whitelisted, **${robloxUsername}**.`;
      }
      await interaction.editReply(replyOptions);

      // --- Handle Roles & DM ---
      if (member.roles.cache.has(KEY_ROLE_IDS[0])) {
        await member.roles.remove(KEY_ROLE_IDS[0]); 
      }

      if (!member.roles.cache.has(BUYERS_ROLE_ID)){
        await member.roles.add(BUYERS_ROLE_ID);
      }
      const embedy = new EmbedBuilder()
        .setAuthor({
          name: `Welcome to the group ${interaction.member.displayName}!`,
          iconURL: interaction.guild.iconURL()
        })
        .setTitle("Congratulations!")
        .setDescription(
          `Congratulations, ${interaction.member.displayName}! you have been successfully whitelisted with the account: \`\`${robloxUsername}\`\`.\n
           You can now use Envy Serverside, just join any game from the list provided in the buyers server and you should see Envy pop up :eye:\n
           Make sure to abide by the rules (TON - Terms of Use) to avoid getting blacklisted.\n
           I hope you enjoy Envy, we worked very hard on it. If you have any questions, feel free to open a ticket and you'll be supported very quickly.\n
           Have fun, don't be envious, be a good person :purple_heart:`
        )
        .setColor("#7f00d4")
        .setFooter({
          text: "Envy Serverside welcomes you :)",
          iconURL: interaction.guild.iconURL(),
        })
        .setTimestamp();

      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        try {
          await interaction.user.send({ embeds: [embedy] });
        } catch (err) {
          console.error("Could not send private message.");
        }
      }

      // --- Run Cleanup and Final Whitelisting in the Background ---
      cleanupAndWhitelist(interaction, robloxId, robloxUsername);

    } catch (err) {
      // The global error handler in index.js will now catch this
      // and prevent the crash, so we just re-throw it.
      throw err;
    }
  },
};
