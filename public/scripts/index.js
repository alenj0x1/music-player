function showToHomeButton() {
	$('body').append(`
    <div class="to-home btn">
      <svg class="icon" width="50" height="50" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
      </svg>
    </div>
  `);

	$(document).on('click', '.to-home', async () => {
		await electron.moveToView('index', '');
	});
}

function showToTop() {
	$('body').append('<div class="to-top">✈️</div>');

	$(document).on('click', '.to-top', async () => {
		window.location.href = '#';
	});
}
