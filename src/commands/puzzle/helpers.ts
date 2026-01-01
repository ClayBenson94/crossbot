import {
	ChannelType,
	ButtonStyle,
	ActionRowBuilder,
	ButtonBuilder,
	Guild,
	CategoryChannel,
	Collection,
	NonThreadGuildBasedChannel,
	TextChannel,
} from 'discord.js';
import config from '../../config';
import {
	Browser,
	Page,
	chromium,
} from 'playwright';

// RegEx that matches CrossWithFriends URLs for active games
// Example: https://www.crosswithfriends.com/beta/game/100418498-gaft
const WEBSITE_REGEX = /https:\/\/crosswithfriends.com\/beta\/game\/(.*)/im;

export const urlFormatIsValid = async (url: string): Promise<boolean> => {
	const match = url.match(WEBSITE_REGEX);
	if (!match || !url) {
		return false;
	}

	return true;
};

export const checkIfTooManyPuzzles = async (guild: Guild, channels: Collection<string, NonThreadGuildBasedChannel | null>): Promise<boolean> => {
	const numActivePuzzles = channels.filter((ch) => {
		return ch?.parentId === config.activePuzzlesChannelCategoryId;
	}).size;

	if (numActivePuzzles >= 5) {
		return true;
	}
	return false;
};

export const newBrowserAndPage = async (): Promise<[Browser, Page]> => {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	await page.setViewportSize({
		width: 1280,
		height: 1080,
	});
	return [browser, page];
};

export const fetchPuzzleTitleFromUrl = async (page: Page, url: string): Promise<string | null> => {
	await page.goto(url);
	const puzzleTitle = await page.locator('.chat--header--title').textContent();
	return puzzleTitle;
};

export const changeUsername = async (page: Page): Promise<void> => {
	await page.locator('.chat--username--input').fill('Crossbot');
	await page.locator('.chat--username--input').press('Enter');
};

export const commentDicsordLinksInGameChat = async (page: Page, url: string, channelName: string, serverID: string, channelID: string): Promise<void> => {
	await page.goto(url);
	await changeUsername(page);
	const discordURLNoProtocol = `discord.com/channels/${serverID}/${channelID}`;
	const chatMessages = [
		`Hey everyone, Crossbot here!`,
		`Here's a few links back to our Discord Server (these will only work if you're already a member!)`,
		`(You'll need to copy them into your browser to get to the right place)`,
		`Go to the #${channelName} channel (Discord): discord://${discordURLNoProtocol}`,
		`Go to the #${channelName} channel (Browser): https://${discordURLNoProtocol}`,
	];
	for (const chatMessage of chatMessages) {
		await page.locator('.chat--bar--input').fill(chatMessage);
		await page.locator('.chat--bar--input').press('Enter');
	}
	return;
};

export const createChannel = async (guild: Guild, title: string, url: string, submitterUserId: string): Promise<TextChannel> => {
	const categoryChannel = await guild.channels.fetch(config.activePuzzlesChannelCategoryId) as CategoryChannel;
	const createdChannel = await guild.channels.create({
		name: title,
		type: ChannelType.GuildText,
		parent: categoryChannel,
		topic: url,
	});

	// build and send an announcement message
	const row = new ActionRowBuilder<ButtonBuilder>()
		.addComponents(
			new ButtonBuilder()
				.setLabel('Play this crossword!')
				.setStyle(ButtonStyle.Link)
				.setURL(url),
		);

	const msg = await createdChannel.send({
		content: `🧩🚨 <@&${config.puzzWatchersRoleId}> New Puzzle added!\nThanks to <@${submitterUserId}> for submitting this one! 🤜 🤛`,
		components: [row],
	});
	await msg.pin();
	return createdChannel;
};
