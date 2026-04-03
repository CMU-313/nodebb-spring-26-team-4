
/* eslint-disable strict */
//var request = require('request');

const translatorApi = module.exports;

// translatorApi.translate = function (postData) {
//     return ['is_english',postData];
// };

translatorApi.translate = async function (postData) {
//  Edit the translator URL below
	const TRANSLATOR_API = 'http://17313-team06.s3d.cmu.edu:5000';
	try{
		const response = await fetch(TRANSLATOR_API + '/?content=' + postData.content);
		const data = await response.json();
		return [data.is_english, data.translated_content];
	} catch (e) {
		return ['is_english', postData];
	}
};