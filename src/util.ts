import * as Discord from 'discord.js';
import Redis from 'ioredis';
const redis = new Redis(process.env.redis_path);
import * as adler32 from 'adler32';

export async function getHost(client: Discord.Client) {
    const hostId:bigint = BigInt(process.env.host_id);
    return await client.users.fetch(hostId); // Will throw an error if a non valid host id is provided
}

// This no workey
// export async function leaveGuild(guild: Discord.Guild | bigint, client: Discord.Client) {
//     if (typeof guild === 'bigint') {
//         client.guilds.cache.get(guild).leave().catch(console.error);
//     } else {
//         await guild.leave();
//     }
// }

export async function sendGuildJoinNotification(guild: Discord.Guild, client: Discord.Client) {
    const host = await getHost(client);
    var date = new Date();

    const embed = new Discord.MessageEmbed()
    .setAuthor(guild.name, guild.iconURL())
    .addFields(
        { name: 'Guild id', value: guild.id.toString() },
        { name: 'Member count', value: guild.memberCount.toString() },
        { name: 'Guild owner id', value: guild.ownerId.toString() },
        { name: 'Vanity invite', value: guild.vanityURLCode || 'none'}
    ).setFooter(date.toISOString());

    await host.send({ embeds: [embed] });
}

export const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",
    
    fg: {
        black: "\x1b[30m",
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        magenta: "\x1b[35m",
        cyan: "\x1b[36m",
        white: "\x1b[37m",
        crimson: "\x1b[38m" 
    },
    bg: {
        black: "\x1b[40m",
        red: "\x1b[41m",
        green: "\x1b[42m",
        yellow: "\x1b[43m",
        blue: "\x1b[44m",
        magenta: "\x1b[45m",
        cyan: "\x1b[46m",
        white: "\x1b[47m",
        crimson: "\x1b[48m"
    }
};

export async function requestNetwork(interaction: Discord.CommandInteraction, client: Discord.Client) {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(Discord.Permissions.FLAGS.ADMINISTRATOR)) {
        await interaction.reply({
            content: 'You need to be an administrator to be able to run this command',
            ephemeral: true
        });
        return;
    }

    if (await isPartOfNetwork(interaction.guild.id)) {
        await interaction.reply({
            content: 'This server is already registered with the network',
            ephemeral: true
        });
        return;
    }

    const clientMember = await interaction.guild.members.fetch(client.user.id);
    if (!clientMember.permissions.has(Discord.Permissions.FLAGS.BAN_MEMBERS)) {
        await interaction.reply({
            content: 'Missing permission `BAN_MEMBERS`',
            ephemeral: true
        });
        return;
    }

    const channel = interaction.options.get('channel').channel as Discord.GuildChannel;
    if (!clientMember.permissionsIn(channel).has(Discord.Permissions.FLAGS.SEND_MESSAGES)) {
        await interaction.reply({
            content: 'Missing permission `SEND_MESSAGES` in the specified channel',
            ephemeral: true
        });
        return;
    }

    if (!clientMember.permissionsIn(channel).has(Discord.Permissions.FLAGS.VIEW_CHANNEL)) {
        await interaction.reply({
            content: 'Missing permission `VIEW_CHANNEL` in the specified channel',
            ephemeral: true
        });
        return;
    }

    await sendRequestEmbed(interaction, client, channel);
    await interaction.reply({
        content: 'A request has been sent to the bot owner',
        ephemeral: true
    });
}

async function sendRequestEmbed (interaction: Discord.CommandInteraction, client: Discord.Client, channel: Discord.GuildChannel) {
    const host = await getHost(client);

    const authorEmbed = new Discord.MessageEmbed()
    .setAuthor(interaction.user.tag, interaction.user.avatarURL())
    .setDescription(`Server owner?: ${interaction.guild.ownerId === interaction.user.id ? true : false}`)
    .setFooter(`UID: ${interaction.user.id}`);

    const guildEmbed = new Discord.MessageEmbed()
    .setAuthor(interaction.guild.name, interaction.guild.iconURL())
    .setDescription(`Channel: #${channel.name} \nCID: ${channel.id}`)
    .setFooter(`GID: ${interaction.guild.id}`);

    const row = new Discord.MessageActionRow()
        .addComponents(
            new Discord.MessageButton()
            .setLabel('Accept')
            .setStyle('SUCCESS')
            .setCustomId(`accept-${interaction.guild.id}-${channel.id}`),
            new Discord.MessageButton()
            .setLabel('Reject')
            .setStyle('DANGER')
            .setCustomId(`reject-${interaction.guild.id}`)
        );

    await host.send({ content: 'New network join request', embeds: [authorEmbed, guildEmbed], components: [row]});
}

export async function disableButtons (interaction: Discord.ButtonInteraction) {
    const embeds = interaction.message.embeds as Discord.MessageEmbed[];
    if (interaction.message.content) {
        await interaction.update({ content: interaction.message.content, embeds: embeds, components: []});
    } else {
        await interaction.update({ embeds: embeds, components: []});
    }
}

export async function acceptGuild(args: string[], client: Discord.Client, interaction: Discord.ButtonInteraction) {
    await redis.set(`cb:${args[1]}`, args[2]);
    await redis.sadd('cb:servers', args[1]);
    await disableButtons(interaction);
    const channel = await client.channels.fetch(BigInt(`${args[2]}`)) as Discord.TextChannel;
    await channel.send('The bot owner has accepted the request to join the network.');
}

export async function removeFromNetwork(guildId: bigint) {
    await redis.srem('cb:servers', guildId);
    await redis.del(`cb:${guildId}`);
}

export async function isPartOfNetwork(guildId: bigint): Promise<boolean> {
    return await redis.sismember('cb:servers', guildId) ? true : false;
}

export async function storeBanData(userId: bigint, guildId: bigint, reason: string) {
    const banKey = `cb:ban:${adler32.sum(userId + guildId)}`;
    await redis.set(`${banKey}:userId`, userId);
    await redis.set(`${banKey}:guildId`, guildId);
    await redis.set(`${banKey}:reason`, reason);
}

export async function askToShare(guildId: bigint, client: Discord.Client, ban: Discord.GuildBan) {
    const reason = (await ban.guild.bans.fetch(ban.user)).reason;
    if (reason.includes('Crossban from ')) return;

    

    await storeBanData(ban.user.id, ban.guild.id, reason || 'no reason provided');
    const channel = await client.channels.fetch(BigInt(`${await redis.get(`cb:${guildId}`)}`)) as Discord.TextChannel;
    await sendAskToShareEmbed(channel, ban);
}

export async function sendAskToShareEmbed(channel: Discord.TextChannel, ban: Discord.GuildBan) {
    const embed = new Discord.MessageEmbed()
    .setAuthor(ban.user.tag, ban.user.avatarURL())
    .setDescription(`**Reason**: ${ban.reason || 'no reason provided'}`)
    .setFooter('Share this ban with the network?');

    const banHash = adler32.sum(`${ban.user.id}${ban.guild.id}`);
    const row = new Discord.MessageActionRow()
    .addComponents(
        new Discord.MessageButton()
        .setLabel('Share')
        .setStyle('SUCCESS')
        .setCustomId(`share-${banHash}`),
        new Discord.MessageButton()
        .setLabel('Don\'t share')
        .setStyle('DANGER')
        .setCustomId(`cancel-${banHash}`)
    );

    await channel.send({ 
        content: 'New ban detected', 
        embeds: [embed], components: 
        [row] 
    });
}

export async function shareBan(banHash: string, client: Discord.Client) {
    const servers = await redis.smembers('cb:servers');
    const banKey = `cb:ban:${banHash}`;
    const userId = await redis.get(`${banKey}:userId`) as bigint;
    const guildId = await redis.get(`${banKey}:guildId`) as bigint;
    const reason = await redis.get(`${banKey}:reason`) as string;

    const user = await client.users.fetch(userId);

    for(let server of servers) {
        const guild = await client.guilds.fetch(server);
        const guildBans = await guild.bans.fetch();
        if (guildBans.get(user.id)) {
            await sendAlreadyBannedEmbed(user, guild, reason, client, guildId);
            continue;
        } else {
            await sendShareEmbed(user, guild, reason, client, guildId)
        }
    }
}

async function sendShareEmbed(user: Discord.User, guild: Discord.Guild, reason: string, client: Discord.Client, originGuildId: bigint) {
    const channel = await client.channels.fetch(BigInt(`${await redis.get(`cb:${guild.id}`)}`)) as Discord.TextChannel;
    const originGuild = await client.guilds.fetch(originGuildId);

    const embed = new Discord.MessageEmbed()
    .setAuthor(`${user.tag} was banned in ${originGuild.name}`, user.avatarURL())
    .setDescription(`**Reason:** ${reason}`)
    .setFooter('Apply this ban to this server?');

    const row = new Discord.MessageActionRow()
    .addComponents(
        new Discord.MessageButton()
        .setLabel('Apply ban')
        .setStyle('DANGER')
        .setCustomId(`ban-${adler32.sum(`${user.id}${originGuildId}`)}`)
    );

    if (originGuildId === guild.id) {
        return;
    }

    await channel.send({
        content: `New ban shared from ${originGuild.name}`,
        embeds: [embed],
        components: [row]
    });
}

async function sendAlreadyBannedEmbed(user: Discord.User, guild: Discord.Guild, reason: string, client: Discord.Client, originGuildId: bigint) {
    const channel = await client.channels.fetch(BigInt(`${await redis.get(`cb:${guild.id}`)}`)) as Discord.TextChannel;
    const originGuild = await client.guilds.fetch(originGuildId);

    const embed = new Discord.MessageEmbed()
    .setAuthor(`${user.tag} was banned in ${originGuild.name}`)
    .setDescription(`**Reason:** ${reason}`)
    .setFooter('This user is already banned in this guild');

    if (originGuildId === guild.id) {
        return;
    }

    await channel.send({
        content: `New ban shared from ${originGuild.name}`,
        embeds: [embed]
    });
}

export async function applyBan(args: string[], interaction: Discord.ButtonInteraction, client: Discord.Client) {
    const banHash = args[1];
    const banKey = `cb:ban:${banHash}`;
    const userId = await redis.get(`${banKey}:userId`) as bigint;
    const guildId = await redis.get(`${banKey}:guildId`) as bigint;
    const reason = await redis.get(`${banKey}:reason`) as string;
    const guild = await client.guilds.fetch(guildId);

    await interaction.guild.members.ban(userId, { reason: `Crossban from ${guild.name}: ${reason}` }).catch(async err => {
        await interaction.reply(`Couldn't ban user: \`${err}\``);
    });

    if (!interaction.replied) {
        await disableButtons(interaction);
        await interaction.followUp({ content: `<@${interaction.user.id}> applied this ban` });  
    }
}
