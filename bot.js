import { Client, GatewayIntentBits, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { format, compId, inLastHour } from './format.js';

const WCA = 'https://www.worldcubeassociation.org/api/v0/competitions';

async function getJson(url) {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`WCA ${res.status} for ${url}`);
  return res.json();
}

const getComp = (id) => getJson(`${WCA}/${id}`);

// 25 latest-announced CA comps; far more than one hour ever brings.
const newQuebecComps = async () =>
  (await getJson(`${WCA}?country_iso2=CA&sort=-announced_at&per_page=25`))
    .filter((c) => c.city.endsWith(', Quebec') && inLastHour(c));

if (process.argv[2] === 'print') {
  const comp = await getComp(compId(process.argv[3] ?? '') ?? '');
  if (!comp) throw new Error('Unknown competition');
  console.log(format(comp));
  process.exit(0);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const ping = { parse: ['everyone'] };

const command = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Annonce une compétition WCA')
  .addStringOption((o) => o.setName('url').setDescription('URL ou id de la compétition WCA').setRequired(true))
  .addBooleanOption((o) => o.setName('private').setDescription('Aperçu visible seulement par toi, sans @everyone'))
  .setDefaultMemberPermissions(PermissionFlagsBits.MentionEveryone)
  .setContexts(InteractionContextType.Guild);

client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand() || i.commandName !== 'announce') return;
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const id = compId(i.options.getString('url'));
    const comp = id && (await getComp(id));
    if (!comp) return await i.editReply('Compétition introuvable.');
    if (i.options.getBoolean('private')) return await i.editReply({ content: format(comp), allowedMentions: { parse: [] } });
    // Sent as a new message: mentions in an edited interaction reply don't notify.
    await i.channel.send({ content: format(comp), allowedMentions: ping });
    await i.editReply('Annonce publiée.');
  } catch (e) {
    console.error(e);
    await i.editReply(`Erreur: ${e.message}`);
  }
});

async function hourly(attempt = 1) {
  try {
    const channel = await client.channels.fetch(process.env.ANNOUNCE_CHANNEL_ID);
    for (const c of await newQuebecComps()) {
      await channel.send({ content: format(c), allowedMentions: ping });
      console.log(`announced ${c.id}`);
    }
  } catch (e) {
    console.error(`hourly check attempt ${attempt} failed`, e);
    // Retries stay before minute 55 so they still compute the same hour window.
    if (attempt < 4) setTimeout(() => hourly(attempt + 1), 10 * 60e3);
  }
}

function scheduleHourly() {
  const next = new Date();
  next.setUTCMinutes(5, 0, 0);
  if (next <= Date.now()) next.setUTCHours(next.getUTCHours() + 1);
  setTimeout(() => {
    hourly();
    scheduleHourly();
  }, next - Date.now());
}

client.once('clientReady', async () => {
  await client.application.commands.set([command]);
  console.log(`logged in as ${client.user.tag}`);
  scheduleHourly();
});

client.login(process.env.DISCORD_TOKEN);
