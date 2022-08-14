import { AppPage } from '@backfr/runtime';

const MyApp: AppPage = ({ Component, pageProps }) => {
	return (
		<>
			<h1>Default App</h1>
			<Component {...pageProps} />
		</>
	);
};

export default MyApp;
