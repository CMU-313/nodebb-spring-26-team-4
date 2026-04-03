
/* eslint-disable strict */
//var request = require('request');

const translatorApi = module.exports;

// translatorApi.translate = function (postData) {
//     return ['is_english',postData];
// };

translatorApi.translate = async function (postData) {
//  Edit the translator URL below
	const TRANSLATOR_API = 'http://host.docker.internal:5000';
	try{
		// console.log('fetching from');
		// console.log(TRANSLATOR_API + '/?content=' + postData.content);
		const response = await fetch(TRANSLATOR_API + '/?content=' + postData.content);
		const data = await response.json();
		// console.log('Success');
		// console.log(data.is_english);
		// console.log(data.translated_content);
		// console.log('content output above');
		return [data.is_english, data.translated_content];
	} catch (e) {
		console.log('Not good');
		return ['is_english', postData];
	}
};