import { AppPage } from '../types.js';

const MyApp: AppPage = ({ Component, pageProps }) => {
	return (
		<>
			<h1>Default App</h1>
			<Component {...pageProps} />
		</>
	);
};

export default MyApp;
