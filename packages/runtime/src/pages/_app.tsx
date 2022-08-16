import { AppPage } from '../types.js';

const App: AppPage = ({ Component, pageProps }) => {
	return <Component {...pageProps} />;
};

export default App;
