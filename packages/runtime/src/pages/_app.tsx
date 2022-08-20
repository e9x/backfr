import type { AppPage } from '../../types';

const App: AppPage = ({ Component, pageProps }) => {
	return <Component {...pageProps} />;
};

export default App;
