const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const supabase = require("../supabaseClient");
const noblox = require("noblox.js");
const { GROUP_ID } = require("../config");

const ITEMS_PER_PAGE = 10;

module.exports = {
  permissions: [PermissionFlagsBits.Administrator],
  data: new SlashCommandBuilder()
    .setName("envied")
    .setDescription("Lists all whitelisted users and syncs with the Roblox group."),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Step 1: Fetch all blacklisted users first
      const { data: blacklistedUsers, error: blacklistError } = await supabase
        .from("blacklists")
        .select("envy_id, discord_id, roblox_id, roblox_username, created_at");

      if (blacklistError) throw blacklistError;

      const blacklistedEnvyIds = new Set(
        blacklistedUsers ? blacklistedUsers.map(u => parseInt(u.envy_id, 10)) : []
      );

      // Step 2: Get all members from the Roblox group for syncing whitelists
      const roles = await noblox.getRoles(GROUP_ID);
      const groupMemberIds = new Set();
      for (const role of roles) {
          const playersInRole = await noblox.getPlayers(GROUP_ID, role.id);
          for (const player of playersInRole) {
              groupMemberIds.add(player.userId);
          }
      }

      // Step 3: Get all whitelisted users from Supabase (initial fetch)
      let { data: whitelistedUsers, error: fetchError } = await supabase
        .from("whitelists")
        .select("envy_id, discord_id, roblox_id, roblox_username, created_at")
        .order("envy_id", { ascending: true });

      if (fetchError) throw fetchError;

      // Step 4: Sync whitelist (only whitelisted users)
      const updates = [];
      const usersToDelete = [];

      for (const user of whitelistedUsers) {
        const validIds = [];
        const validUsernames = [];
        let hasAtLeastOneAccountInGroup = false;

        for (let i = 0; i < user.roblox_id.length; i++) {
          const robloxId = user.roblox_id[i];
          if (groupMemberIds.has(parseInt(robloxId, 10))) {
            validIds.push(robloxId);
            validUsernames.push(user.roblox_username[i]);
            hasAtLeastOneAccountInGroup = true;
          }
        }

        if (!hasAtLeastOneAccountInGroup) {
          usersToDelete.push(user.envy_id);
        } else if (validIds.length < user.roblox_id.length) {
          updates.push({
            envy_id: user.envy_id,
            roblox_id: validIds,
            roblox_username: validUsernames,
          });
        }
      }

      if (usersToDelete.length > 0) {
        await supabase.from("whitelists").delete().in("envy_id", usersToDelete);
      }
      if (updates.length > 0) {
        for (const update of updates) {
          await supabase.from("whitelists").update({ roblox_id: update.roblox_id, roblox_username: update.roblox_username }).eq("envy_id", update.envy_id);
        }
      }

      // Step 5: Re-fetch the whitelisted users to get an up-to-date list
      let { data: finalWhitelistedUsers, error: finalFetchError } = await supabase
        .from("whitelists")
        .select("envy_id, discord_id, roblox_id, roblox_username, created_at")
        .order("envy_id", { ascending: true });

      if (finalFetchError) throw finalFetchError;

      // Step 6: Combine whitelisted and blacklisted users
      const allUsers = [...(finalWhitelistedUsers || []), ...(blacklistedUsers || [])];
      allUsers.sort((a, b) => a.envy_id - b.envy_id);
      
      if (!allUsers || allUsers.length === 0) {
        return interaction.editReply({
          content: "❌ No users have been whitelisted or blacklisted yet.",
          ephemeral: true,
        });
      }

      const totalPages = Math.ceil(allUsers.length / ITEMS_PER_PAGE);
      let page = 0;

      const generateEmbed = (currentPage) => {
        const start = currentPage * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const currentItems = allUsers.slice(start, end);

        return new EmbedBuilder()
          .setAuthor({
            name: "Envy Watcher | Whitelisted & Blacklisted Users:",
            iconURL: interaction.guild.iconURL(),
          })
          .setColor("#7501d4")
          .setDescription(
            currentItems
              .map(
                (item) => {
                  const isBlacklisted = blacklistedEnvyIds.has(parseInt(item.envy_id, 10));
                  const text = `> ${item.envy_id} - <@${item.discord_id}> - \`${item.roblox_username.join(", ") || 'N/A'}\` - <t:${Math.floor(
                    new Date(item.created_at).getTime() / 1000,
                  )}:D>`;
                  return isBlacklisted ? `~~${text}~~` : text;
                }
              )
              .join("\n") || "No users to display on this page.",
          )
          .setFooter({ text: `Page ${currentPage + 1} of ${totalPages} | BL: ${blacklistedUsers?.length}, WL: ${finalWhitelistedUsers?.length}, All: ${allUsers?.length}` });
      };

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("prev_page")
          .setLabel("◀️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("next_page")
          .setLabel("▶️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(totalPages <= 1),
      );

      const message = await interaction.editReply({
        embeds: [generateEmbed(page)],
        components: [row],
        ephemeral: true
      });

      const collector = message.createMessageComponentCollector({
        time: 60000,
      });

      collector.on("collect", async (i) => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: "You cannot use these buttons.", ephemeral: true });
        }
        
        if (i.customId === "prev_page") {
          page--;
        } else if (i.customId === "next_page") {
          page++;
        }

        row.components[0].setDisabled(page === 0);
        row.components[1].setDisabled(page === totalPages - 1);

        await i.update({
          embeds: [generateEmbed(page)],
          components: [row],
        });
      });

      collector.on("end", () => {
        row.components.forEach((c) => c.setDisabled(true));
        interaction.editReply({ components: [row] }).catch(() => {});
      });
    } catch (err) {
      console.error("Error executing /envied command:", err);
      const errorMessage = "❌ An error occurred while executing the command.";
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: errorMessage, ephemeral: true }).catch(console.error);
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true }).catch(console.error);
      }
    }
  },
};
