import {
	SlashCommandBuilder,
	AttachmentBuilder,
	EmbedBuilder,
	ChatInputCommandInteraction,
	Collection,
	TextChannel,
} from 'discord.js';
import { SlashCommand } from '../';
import { chromium } from 'playwright';
import slugify from 'slugify';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
	urlFormatIsValid,
	checkIfTooManyPuzzles,
	fetchPuzzleTitleFromUrl,
	createChannel,
	commentDicsordLinksInGameChat,
	newBrowserAndPage,
} from './helpers';
import config from '../../config';
dayjs.extend(relativeTime);

const NEW_PUZZLE_SUBCMD = 'new';
const CLOSE_PUZZLE_SUBCMD = 'close';

export default {
	data: new SlashCommandBuilder()
		.setName('puzzle')
		.setDescription('Manage puzzles')
		.addSubcommand(subcommand =>
			subcommand
				.setName(NEW_PUZZLE_SUBCMD)
				.setDescription('Starts a new puzzle')
				.addStringOption(option =>
					option
						.setName('url')
						.setDescription('The full URL of the CrossWithFriends game')
						.setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName(CLOSE_PUZZLE_SUBCMD)
				.setDescription('Finishes and archives a puzzle')
		),
	async execute(interaction: ChatInputCommandInteraction) {
		switch (interaction.options.getSubcommand()) {
			case NEW_PUZZLE_SUBCMD:
			// do new puzzle stuff
				newpuzzle(interaction);
				break;
			case CLOSE_PUZZLE_SUBCMD:
			// do close puzzle stuff
				closepuzzle(interaction);
				break;
		}
	},
} as SlashCommand;

async function newpuzzle(interaction: ChatInputCommandInteraction) {
	try {
		await interaction.deferReply({
			ephemeral: true,
		});

		// Ensure the `guild` property is accessible
		const guild = interaction.guild;
		if (!guild) {
			await interaction.editReply('⚠️ I couldn\'t find the guild for this interaction!');
			return;
		}

		const url = interaction.options.getString('url') || '';
		if (!urlFormatIsValid(url)) {
			await interaction.editReply('⚠️ Your URL didn\'t seem to be quite what I expected.\nMake sure it\'s got "/beta/game" in it to ensure it\'s a puzzle session!');
		}

		// Check to see if we have too many puzzles already
		const allChannels = await guild.channels.fetch();
		if (await checkIfTooManyPuzzles(guild, allChannels)) {
			await interaction.editReply(`⚠️ There are too many puzzles currently active! Try completing some of the existing ones first! 🧠`);
			return;
		}

		// create a new browser for this instance of the command
		const [browser, page] = await newBrowserAndPage();

		// Get the title of the puzzle
		const puzzleTitle = await fetchPuzzleTitleFromUrl(page, url);
		if (!puzzleTitle) {
			await interaction.editReply('⚠️ I couldn\'t find the puzzle title on that page!');
			return;
		}

		// slugify the title
		const channelTitle = slugify(puzzleTitle, {
			remove: /[,._\-'"]/gm,
			replacement: '_',
			lower: true,
		});

		// Check to see if there's another channel already with this title
		const existingChannel = allChannels.find((ch) => {
			return ch?.name === channelTitle;
		});

		if (existingChannel) {
			await interaction.editReply(`⚠️ There's already a channel for this puzzle! <#${existingChannel.id}>`);
			return;
		}

		// make the channel
		const submitterUserId = interaction.member?.user.id || '';
		const createdChannel = await createChannel(guild, channelTitle, url, submitterUserId);

		// comment links in the game chat
		await commentDicsordLinksInGameChat(page, url, channelTitle, guild.id, createdChannel.id);

		// Reply to the user to point them to the new channel
		await interaction.editReply(`<#${createdChannel.id}> has been created! 🎉`);
		await browser.close();
	}
	catch (e) {
		console.error('Error in command', e);
		await interaction.editReply(`⚠️ Error running command. Please reach out to my developer`);
	}
}

async function closepuzzle(interaction: ChatInputCommandInteraction) {
	try {
		await interaction.deferReply({
			ephemeral: true,
		});

		// Ensure the `guild` property is accessible
		if (!interaction.guild) {
			await interaction.editReply('⚠️ I couldn\'t find the guild for this interaction!');
			return;
		}

		// Check to see if this was invoked in an active puzzle channel
		const channelSentIn = await interaction.guild.channels.fetch(interaction.channelId) as TextChannel;

		if (channelSentIn?.parentId !== config.activePuzzlesChannelCategoryId) {
			await interaction.editReply('☝️ Tsk tsk! You can\'t use this command to archive anything but puzzles in the "Active Puzzles" category!');
			return;
		}

		// Fetch all puzzles in the old puzzles channel
		const allChannels = await interaction.guild.channels.fetch();
		const oldPuzzles = allChannels.filter((ch) => {
			const isTextBased = ch?.isTextBased();
			const isPartOfOldChannelCategory = ch && ch.parentId === config.oldPuzzlesChannelCategoryId;
			return isTextBased && isPartOfOldChannelCategory;
		}) as Collection<string, TextChannel>; // This TextChannel cast is safe because we're filtering for text channels with .isTextBased()

		const MAX_OLD_PUZZLES = 45; // Discord has a max of 50 channels, so stay just a few short of that
		// If we have too many old puzzles and need to start deleting them
		if (oldPuzzles.size > MAX_OLD_PUZZLES) {
			// Fetch message counts per channel to identify which to delete
			const channelsWithIDsAndMessageCounts = [];
			for (const [channelID, channel] of oldPuzzles) {
				const messages = await channel.messages.fetch({
					cache: true,
				});
				channelsWithIDsAndMessageCounts.push({
					id: channelID,
					messageCount: messages.size,
				});
			}

			// Sort channels by the least messages
			channelsWithIDsAndMessageCounts.sort((a, b) => {
				return a.messageCount - b.messageCount;
			});

			// Calculate how many puzzles we need to delete to get to MAX_OLD_PUZZLES
			const numPuzzlesToDelete = oldPuzzles.size - MAX_OLD_PUZZLES;

			// Delete the puzzles with the smallest number of messages until we get to MAX_OLD_PUZZLES
			for (let i = 0; i < numPuzzlesToDelete; i++) {
				const channelIDToDelete = channelsWithIDsAndMessageCounts[i].id;
				const channelToDelete = await interaction.guild.channels.fetch(channelIDToDelete);
				if (channelToDelete) {
					await channelToDelete.delete();
				}
			}
		}

		// Get a screenshot of the puzzle
		const urlToScreenshot = channelSentIn.topic;
		if (!urlToScreenshot) {
			await interaction.editReply('⚠️ I couldn\'t find the URL for this puzzle!');
			return;
		}
		const browser = await chromium.launch();
		const page = await browser.newPage();
		await page.setViewportSize({
			width: 1280,
			height: 1080,
		});
		await page.goto(urlToScreenshot);
		const screenshot = await page.locator('.player--main--left--grid').screenshot();
		const numPlayers = await page.locator('.dot').count() - 2; // minus two because of the bot being a player when visiting this page (once on create, once on close)
		await page.waitForTimeout(1000); // wait for the clock to update
		const solvingTimeRaw = await page.locator('.clock').textContent();
		const solvingTime = solvingTimeRaw?.replaceAll('(', '').replaceAll(')', '') || 'Unknown';
		await browser.close();

		const attachment = new AttachmentBuilder(screenshot, {
			name: `${channelSentIn.name}.png`,
		});
		const timeDiff = dayjs(channelSentIn.createdAt).fromNow(true);
		const embed = new EmbedBuilder()
			.setColor(0xFFFF00)
			.setTitle('🏁 This puzzle has been marked as completed!')
			.addFields(
				{
					name: '🕔 Time to Complete',
					value: `${timeDiff}`,
				},
				{
					name: '🤔 Time Spent Solving',
					value: `${solvingTime}`,
				},
				{
					name: '👥 Number of Players',
					value: `${numPlayers}`,
				},
				{
					name: '👨‍💻 Finished by',
					value: `<@${interaction.member?.user.id}>`,
				},
			);

		await channelSentIn.send({
			embeds: [embed],
			files: [attachment],
		});

		// Move the channel to the old puzzles category
		await channelSentIn.setParent(config.oldPuzzlesChannelCategoryId);

		// Reply with a success message
		await interaction.editReply(`You closed <#${channelSentIn.id}>`);
	}
	catch (e) {
		console.error('Error in command', e);
		await interaction.editReply(`⚠️ Error running command. Please reach out to my developer`);
	}
}
