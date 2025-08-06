const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
  ActivityType,
} = require("discord.js");
const noblox = require("noblox.js");
const {
  TOKEN,
  COOKIE,
  CLIENT_ID,
  ENVY_BUYERS_SERVER_ID, // same as guild_id
  ENVY_SERVER_ID
} = require("./src/config");

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot is alive and vibing 😎');
});

app.listen(PORT, () => {
  console.log(`Web server running at http://localhost:${PORT}`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, "src/commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  client.commands.set(command.data.name, command);
}

const eventsPath = path.join(__dirname, "src/events");
const eventFiles = fs
  .readdirSync(eventsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

async function deployCommands() {
  const commands = [];
  for (const file of commandFiles) {
    const command = require(`./src/commands/${file}`);
    commands.push(command.data.toJSON());
  }

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands.`,
    );

    const guildIds = [ENVY_BUYERS_SERVER_ID, ENVY_SERVER_ID];
    let allData = [];

    for (const guildId of guildIds) {
      const data = await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, guildId),
        { body: commands }
      );
      allData.push(...data); // Spread in case data is an array
    }

    console.log(
      `Successfully reloaded ${allData.length} application (/) commands.`,
    );
  } catch (error) {
    console.error(error);
  }
}

async function init() {
  await noblox.setCookie(COOKIE);
  console.log("Has Logged into Roblox Account!");

  await deployCommands();

  client.once("ready", () => {
    console.log(`-> Logged in as ${client.user.tag}`);
    client.user.setActivity({
        name: 'Envy Serverside',
        type: ActivityType.Streaming,
        url: 'https://twitch.tv/Roblox' 
    });
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    // Handle permissions
    const member = interaction.member;
    const isOwner = interaction.user.id === interaction.guild.ownerId;
    const isAdmin = member.permissions.has("Administrator");
    const adminPermsEnabled = command.admin_perms !== false; // True by default, can be overridden in the command file

    let hasPermission = false;

    if (isOwner) {
      hasPermission = true;
    } else if (isAdmin && adminPermsEnabled) {
      hasPermission = true;
    } else if (command.permissions) {
      hasPermission = command.permissions.some((permission) => {
        if (typeof permission === "string") {
          return member.roles.cache.has(permission);
        } else {
          return member.permissions.has(permission);
        }
      });
    } else {
      // If a command has no permissions array, everyone can use it.
      hasPermission = true;
    }

    if (!hasPermission) {
      return interaction.reply({
        content: "🚫 You do not have permission to use this command.",
        ephemeral: true,
      });
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Unhandled error during /${interaction.commandName} command:`, error);

      // Universal error message
      const errorMessage = {
        content: "An unexpected error occurred. Please try again later.",
        ephemeral: true,
      };

      // Check the state of the interaction and respond accordingly
      if (interaction.deferred || interaction.replied) {
        // If we've already deferred or replied, we should edit the reply or follow up.
        // editReply is often better if the initial defer was ephemeral.
        // followUp is safer if a reply has already been sent.
        await interaction.editReply(errorMessage).catch(async (e) => {
          // If editing fails (e.g., original message deleted), try to follow up.
          console.error("Failed to edit error reply, attempting to follow up:", e);
          await interaction.followUp(errorMessage).catch(followUpError => {
            console.error("Failed to send follow-up error message:", followUpError);
          });
        });
      } else {
        // If no response has been sent, we can safely reply.
        await interaction.reply(errorMessage).catch(replyError => {
          // This catch is for the rare case where the interaction expires *just* as we try to reply.
          console.error("Failed to send initial error reply:", replyError);
        });
      }
    }
  });

  await client.login(TOKEN);
}

init();
