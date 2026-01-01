import cron from 'node-cron';
import dayjs from 'dayjs';
import { ClientWithCommands } from '../client';
import slugify from 'slugify';
import {
	checkIfTooManyPuzzles,
	commentDicsordLinksInGameChat,
	createChannel,
	newBrowserAndPage,
} from '../commands/puzzle/helpers';
import config from '../config';

export default function SetupCron(client: ClientWithCommands) {
	cron.schedule(config.dailyPuzzleCronUTC, async () => {
		const currentDate = dayjs().format('MMM D, YYYY');
		const guilds = client.guilds.cache.map(guild => guild);
		const guild = guilds[0]; // assume just one guild :)

		console.log(`Starting daily puzzle fetch (${currentDate})...`);
		const [browser, page] = await newBrowserAndPage();
		for (const searchTerm of config.dailyPuzzleTerms) {
			const allChannels = await guild.channels.fetch();
			if (await checkIfTooManyPuzzles(guilds[0], allChannels)) {
				console.log(`\tToo many puzzles, skipping ${searchTerm}`);
				continue;
			}

			const searchFilter = encodeURIComponent(`${currentDate} ${searchTerm}`);
			const searchUrl = `https://api.foracross.com/api/puzzle_list?page=0&pageSize=50&filter%5BnameOrTitleFilter%5D=${searchFilter}&filter%5BsizeFilter%5D%5BMini%5D=true&filter%5BsizeFilter%5D%5BStandard%5D=true`;

			console.log(`\tSearching for ${searchTerm} puzzles...`);
			const fetchData = await fetch(searchUrl, {
				headers: {
					accept: '*/*',
				},
				body: null,
				method: 'GET',
			});

			// parse as json
			const puzzlesJson = (await fetchData.json()) as PuzzleListAPIResponse;

			// handle no results. Oops?
			if (puzzlesJson.puzzles.length === 0) {
				console.log(`\tNo puzzles found for ${searchTerm}`);
				continue;
			}

			// Get the first puzzle, assuming there's only one important result
			const puzzleTitle = puzzlesJson.puzzles[0].content.info.title;
			const puzzleId = puzzlesJson.puzzles[0].pid;
			const channelTitle = slugify(puzzleTitle, {
				remove: /[,._\-'"]/gm,
				replacement: '_',
				lower: true,
			});
			console.log(`\tFound puzzle: ${puzzleTitle} (pid: ${puzzleId}). Navigating to puzzle...`);

			await page.goto(`https://crosswithfriends.com/beta/play/${puzzleId}`);
			await page.waitForURL('https://crosswithfriends.com/beta/game/*');
			const url = await page.url();

			console.log(`\tGot puzzle URL: ${url}`);
			console.log(`\tCreating channel ${channelTitle}...`);

			const createdChannel = await createChannel(guilds[0], channelTitle, url, client.user?.id || '');

			await commentDicsordLinksInGameChat(page, url, channelTitle, guild.id, createdChannel.id);
		}
		await browser.close();
		console.log(`Finished daily puzzle fetch (${currentDate})`);
	});
}

// PuzzleListAPIResponse represents the response from the CrossWithFriends API /api/puzzle_list
// It only captures the fields this application cares about, not the full response
interface PuzzleListAPIResponse {
	puzzles: {
		pid: string
		content: {
			info: {
				title: string
			}
		}
	}[]
}
