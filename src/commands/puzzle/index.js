const { SlashCommandBuilder, ChannelType, ButtonStyle, ActionRowBuilder, ButtonBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { chromium } = require("playwright");
const slugify = require("slugify");
const { ACTIVE_PUZZLES_CHANNEL_CATEGORY_ID, PUZZ_WATCHERS_ROLE_ID, OLD_PUZZLES_CHANNEL_CATEGORY_ID } = require('../../config');
const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');
dayjs.extend(relativeTime);

const NEW_PUZZLE_SUBCMD = "new";
const CLOSE_PUZZLE_SUBCMD = "close";

module.exports = {
	data: new SlashCommandBuilder()
		.setName('puzzle')
		.setDescription("Manage puzzles")
		.addSubcommand(subcommand =>
			subcommand
				.setName(NEW_PUZZLE_SUBCMD)
				.setDescription('Starts a new puzzle')
				.addStringOption(option => 
					option
						.setName('url')
						.setDescription('The full URL of the downforacross session')
						.setRequired(true)
				)
		)
		.addSubcommand(subcommand =>
			subcommand
				.setName(CLOSE_PUZZLE_SUBCMD)
				.setDescription('Finishes and archives a puzzle')
		),
	async execute(interaction) {
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
	}
};

async function newpuzzle(interaction) {
	try {
		const DFAC_REGEX = /https:\/\/downforacross.com\/beta\/game\/(.*)/im //create this each function so that .test() doesn't mess up lastindex
		await interaction.deferReply({ephemeral: true});
		const url = interaction.options.getString('url');

		const match = url.match(DFAC_REGEX)
		if (!match) {
			await interaction.editReply({
				content: "⚠️ Your URL didn't seem to be quite what I expected.\nMake sure it's got \"/beta/game\" in it to ensure it's a puzzle session!",
				ephemeral: true
			})
			return
		}

		// Check to see if we have too many puzzles already
		const allChannels = await interaction.member.guild.channels.fetch()
		const numActivePuzzles = allChannels.filter(ch => {
			return ch.parentId === ACTIVE_PUZZLES_CHANNEL_CATEGORY_ID
		}).size
		
		if (numActivePuzzles >= 5) {
			await interaction.editReply({content: `⚠️ There are too many puzzles currently active! Try completing some of the existing ones first! 🧠`, ephemeral: true});
			return;
		}

		// Get the title of the puzzle
		const browser = await chromium.launch();
		const page = await browser.newPage();
		await page.setViewportSize({ width: 1280, height: 1080 });
		await page.goto(url);
		const puzzleTitle = await page.locator('.chat--header--title').textContent();
		await browser.close();

		// slugify the title
		const channelTitle = slugify(puzzleTitle, {
			remove: /[,._\-'"]/gm,
			replacement: '_',
			lower: true,
		});

		// Check to see if there's another channel already with this title
		const existingChannel = allChannels.find(ch => {
			return ch.name === channelTitle;
		})

		if (existingChannel) {
			await interaction.editReply({content: `⚠️ There's already a channel for this puzzle! <#${existingChannel.id}>`, ephemeral: true});
			return;
		}

		// make the channel
		const categoryChannel = await interaction.member.guild.channels.fetch(ACTIVE_PUZZLES_CHANNEL_CATEGORY_ID)
		const createdChannel = await interaction.member.guild.channels.create({
			name: channelTitle,
			type: ChannelType.GuildText,
			parent: categoryChannel,
			topic: url
		});

		// build and send an announcement message
		const row = new ActionRowBuilder()
		.addComponents(
			new ButtonBuilder()
				.setLabel('Play this crossword!')
				.setStyle(ButtonStyle.Link)
				.setURL(url),
		)

		const msg = await createdChannel.send({
			content: `🧩🚨 <@&${PUZZ_WATCHERS_ROLE_ID}> New Puzzle added!\nThanks to <@${interaction.member.id}> for submitting this one! 🤜 🤛`,
			components: [row]
		});
		await msg.pin();

		// Reply to the user to point them to the new channel
		await interaction.editReply({content: `<#${createdChannel.id}> has been created! 🎉`, ephemeral: true});
	} catch (e) {
		console.error("Error in command", e)
		await interaction.editReply({content: `⚠️ Error running command. Please reach out to my developer`, ephemeral: true});
	}
}

async function closepuzzle(interaction) {
	try {
		await interaction.deferReply({ephemeral: true});

		// Check to see if this was invoked in an active puzzle channel
		const channelSentIn = await interaction.member.guild.channels.fetch(interaction.channelId)
		
		if (channelSentIn?.parentId !== ACTIVE_PUZZLES_CHANNEL_CATEGORY_ID) {
			await interaction.editReply({
				content: "☝️ Tsk tsk! You can't use this command to archive anything but puzzles in the \"Active Puzzles\" category!",
				ephemeral: true
			})
			return
		}

		// Fetch all puzzles in the old puzzles channel
		const allChannels = await interaction.member.guild.channels.fetch()
		const oldPuzzles = allChannels.filter(ch => {
			return ch.parentId === OLD_PUZZLES_CHANNEL_CATEGORY_ID
		})

		const MAX_OLD_PUZZLES = 45; // Discord has a max of 50 channels, so stay just a few short of that
		// If we have too many old puzzles and need to start deleting them
		if (oldPuzzles.size > MAX_OLD_PUZZLES) {
			// Fetch message counts per channel to identify which to delete
			const channelsWithIDsAndMessageCounts = [];
			for (const [channelID, channel] of oldPuzzles) {
				const messages = await channel.messages.fetch({cache: true})
				channelsWithIDsAndMessageCounts.push({
					id: channelID,
					messageCount: messages.size
				})
			}

			// Sort channels by the least messages
			channelsWithIDsAndMessageCounts.sort((a,b) => {
				return a.messageCount - b.messageCount
			});

			// Calculate how many puzzles we need to delete to get to MAX_OLD_PUZZLES
			const numPuzzlesToDelete = oldPuzzles.size - MAX_OLD_PUZZLES;

			// Delete the puzzles with the smallest number of messages until we get to MAX_OLD_PUZZLES
			for (let i = 0; i < numPuzzlesToDelete; i++) {
				const channelIDToDelete = channelsWithIDsAndMessageCounts[i].id;
				const channelToDelete = await interaction.member.guild.channels.fetch(channelIDToDelete)
				await channelToDelete.delete();
			}
		}

		// Get a screenshot of the puzzle
		const urlToScreenshot = channelSentIn.topic;
		const browser = await chromium.launch();
		const page = await browser.newPage();
		await page.setViewportSize({ width: 1280, height: 1080 });
		await page.goto(urlToScreenshot);
		const screenshot = await page.locator('.player--main--left--grid').screenshot();
		const numPlayers = await page.locator('.dot').count() - 2; // minus two because of the bot being a player when visiting this page (once on create, once on close)
		await page.waitForTimeout(1000) // wait for the clock to update
		const solvingTime = (await page.locator('.clock').textContent()).replaceAll("(",'').replaceAll(")","")
		await browser.close();

		const attachment = new AttachmentBuilder(screenshot, {name: `${channelSentIn.name}.png`});
		const timeDiff = dayjs(channelSentIn.createdAt).fromNow(true)
		const embed = new EmbedBuilder()
			.setColor(0xFFFF00)
			.setTitle("🏁 This puzzle has been marked as completed!")
			.addFields(
				{ name: '🕔 Time to Complete', value: `${timeDiff}` },
				{ name: '🤔 Time Spent Solving', value: `${solvingTime}` },
				{ name: '👥 Number of Players', value: `${numPlayers}` },
				{ name: '👨‍💻 Finished by', value: `<@${interaction.member.id}>` },
			)

		await channelSentIn.send({
			embeds: [embed],
			files: [attachment],
		});

		// Move the channel to the old puzzles category
		await channelSentIn.setParent(OLD_PUZZLES_CHANNEL_CATEGORY_ID)

		// Reply with a success message
		await interaction.editReply({content: `You closed <#${channelSentIn.id}>`, ephemeral: true});
	} catch (e) {
		console.error("Error in command", e)
		await interaction.editReply({content: `⚠️ Error running command. Please reach out to my developer`, ephemeral: true});
	}
}
