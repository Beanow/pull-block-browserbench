const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');

module.exports = {
	entry: {
		bench: './src/index.js'
	},
	devtool: 'cheap-source-map',
	devServer: {
		open: true,
		port: 9001
	},
	plugins: [
		new CleanWebpackPlugin(['dist']),
		new HtmlWebpackPlugin({
			template: './src/index.html',
			inject: true
		})
	],
	output: {
      filename: '[name].bundle.js',
      path: path.resolve(__dirname, 'dist')
    }
}
