import { ErrorPage } from '../types.js';

const App: ErrorPage = ({ statusCode, title }) => {
	return (
		<>
			<h1>{title}</h1>
			<p>Encountered a {statusCode} error.</p>
		</>
	);
};

export default App;
