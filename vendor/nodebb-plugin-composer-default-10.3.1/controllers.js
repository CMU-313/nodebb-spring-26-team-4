'use strict';

const Controllers = {};

Controllers.renderAdminPage = function (req, res) {
	res.render('admin/plugins/composer-default', {
		title: 'Composer',
	});
};

module.exports = Controllers;
