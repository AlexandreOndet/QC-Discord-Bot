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
const newQuebecComps = async (hours) =>
  (await getJson(`${WCA}?country_iso2=CA&sort=-announced_at&per_page=25`))
    .filter((c) => c.city.endsWith(', Quebec') && inLastHour(c, new Date(), hours));

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
  const input = i.options.getString('url');
  const who = `${i.user.tag} in #${i.channel?.name}`;
  try {
    const id = compId(input);
    const comp = id && (await getComp(id));
    if (!comp) {
      console.log(`/announce ${input}: not found (${who})`);
      return await i.editReply('Compétition introuvable.');
    }
    if (i.options.getBoolean('private')) {
      console.log(`/announce ${id}: private preview (${who})`);
      return await i.editReply({ content: format(comp), allowedMentions: { parse: [] } });
    }
    // Sent as a new message: mentions in an edited interaction reply don't notify.
    await i.channel.send({ content: format(comp), allowedMentions: ping });
    console.log(`/announce ${id}: posted (${who})`);
    await i.editReply('Annonce publiée.');
  } catch (e) {
    console.error(`/announce ${input} failed (${who})`, e);
    await i.editReply(`Erreur: ${e.message}`);
  }
});

async function postNew(hours = 1) {
  const channel = await client.channels.fetch(process.env.ANNOUNCE_CHANNEL_ID);
  const comps = await newQuebecComps(hours);
  console.log(`check (last ${hours}h): ${comps.length} new`);
  for (const c of comps) {
    await channel.send({ content: format(c), allowedMentions: ping });
    console.log(`announced ${c.id} in #${channel.name}`);
  }
}

async function hourly(attempt = 1) {
  try {
    await postNew();
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
  // `node bot.js check <hours>`: one manual check over a wider window, then exit.
  if (process.argv[2] === 'check') {
    await postNew(Number(process.argv[3] ?? 1));
    process.exit(0);
  }
  await client.application.commands.set([command]);
  console.log(`logged in as ${client.user.tag}`);
  scheduleHourly();
});

client.login(process.env.DISCORD_TOKEN);
