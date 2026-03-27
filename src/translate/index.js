
/* eslint-disable strict */
//var request = require('request');

const translatorApi = module.exports;

translatorApi.translate = async function (postData) {
//  Edit the translator URL below
	const TRANSLATOR_API = 'http://localhost:5000';
	try{
		const response = await fetch(TRANSLATOR_API + '/?content=' + postData.content);
		const data = await response.json();
		return [data.is_english, data.translated_content];
	} catch (e) {
		return ['is_english', postData];
	}
};