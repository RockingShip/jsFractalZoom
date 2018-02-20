function workerFunction() {
	var self = this;
	self.onmessage = function(e) {
		console.log('Received input: '); // message received from main thread
		self.postMessage('this.testData2');
	}
}
