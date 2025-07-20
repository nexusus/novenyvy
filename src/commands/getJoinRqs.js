const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  Guild,
} = require("discord.js");
const noblox = require("noblox.js");
const {
  GROUP_ID,
} = require("../config");

module.exports = {
  permissions: [PermissionFlagsBits.Administrator],
  data: new SlashCommandBuilder()
    .setName("getpending")
    .setDescription("Shows you all the pending whitelist requests"),

    async execute(interaction) {

        await interaction.deferReply({ ephemeral: true });

        try {

            const response = await noblox.getJoinRequests({ group: GROUP_ID });
            const pendingRequests = response.data;

            if (pendingRequests.length === 0) {

                return interaction.editReply({
                    content: "❌ No pending whitelist requests found.",
                });
        }

      const embed = new EmbedBuilder()
        .setAuthor({
          name: "Envy Watcher | Pending Join Requests",
          iconURL: interaction.guild.iconURL(),
        })
        .setTitle("Pending Join Requests")
        .setColor("#9300ce")
        .setDescription(
          pendingRequests
            .map(
              (req) =>
                `**Username:** ${req.requester.username} | **User ID:** ${req.requester.userId}`,
            )
            .join("\n"),
        );

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("❌ Error fetching join requests:", err);
      return interaction.editReply({
        content: "❌ Could not fetch whitelist requests: " + err.message,
      });
    }
}
};
