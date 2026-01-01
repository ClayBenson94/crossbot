// import cron from 'node-cron';

type Config = {
	activePuzzlesChannelCategoryId: string
	oldPuzzlesChannelCategoryId: string
	puzzWatchersRoleId: string
	dailyPuzzleCronUTC: string
	dailyPuzzleTerms: string[]
};

const die = (msg: string) => {
	console.error(msg);
	process.exit(1);
};

const getConfig = (): Config => {
	const activePuzzlesChannelCategoryId = process.env.ACTIVE_PUZZLES_CHANNEL_CATEGORY_ID;
	if (!activePuzzlesChannelCategoryId) {
		return die('ACTIVE_PUZZLES_CHANNEL_CATEGORY_ID is required');
	}

	const oldPuzzlesChannelCategoryId = process.env.OLD_PUZZLES_CHANNEL_CATEGORY_ID;
	if (!oldPuzzlesChannelCategoryId) {
		return die('OLD_PUZZLES_CHANNEL_CATEGORY_ID is required');
	}

	const puzzWatchersRoleId = process.env.PUZZ_WATCHERS_ROLE_ID;
	if (!puzzWatchersRoleId) {
		return die('PUZZ_WATCHERS_ROLE_ID is required');
	}

	// const dailyPuzzleCronUTC = process.env.DAILY_PUZZLE_CRON_UTC;
	// if (!dailyPuzzleCronUTC) {
	// 	return die('DAILY_PUZZLE_CRON_UTC is required');
	// }
	// if (!cron.validate(dailyPuzzleCronUTC)) {
	// 	return die('DAILY_PUZZLE_CRON_UTC is not a valid cron expression');
	// }

	// const dailyPuzzleTermsRaw = process.env.DAILY_PUZZLE_TERMS;
	// if (!dailyPuzzleTermsRaw) {
	// 	return die('DAILY_PUZZLE_TERMS is required');
	// }
	// let dailyPuzzleTerms: string[];
	// try {
	// 	dailyPuzzleTerms = JSON.parse(dailyPuzzleTermsRaw);
	// }
	// catch (e) {
	// 	return die('DAILY_PUZZLE_TERMS must be a JSON array');
	// }

	const finalConfig = {
		activePuzzlesChannelCategoryId,
		oldPuzzlesChannelCategoryId,
		puzzWatchersRoleId,
		// dailyPuzzleTerms: dailyPuzzleTerms,
		// Deprecated the below two settings temporarily
		dailyPuzzleCronUTC: '',
		dailyPuzzleTerms: [],
	};
	console.log(`Config loaded successfully:\n${JSON.stringify(finalConfig, null, 2)}`);
	return finalConfig;
};

export default getConfig();
