import { AppPage } from '../types.js';

const App: AppPage = ({ Component, pageProps }) => {
	return (
		<>
			<h1>Default App</h1>
			<Component {...pageProps} />
		</>
	);
};

export default App;
