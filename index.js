// Import dependencies
const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3050;

app.use(express.json());

let browser;
let page;

// Initialize Puppeteer browser and page
const initializePuppeteer = async () => {
    browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
            request.abort();
        } else {
            request.continue();
        }
    });
};

// Close Puppeteer browser
const closePuppeteer = async () => {
    if (browser) {
        await browser.close();
    }
};

app.post('/search', async (req, res) => {
    const { query } = req.body;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    let url = `https://www.bigfinish.com/releases/v/${encodeURIComponent(query)}`;

    try {
        if (!browser) {
            await initializePuppeteer();
        }

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const metadata = await page.evaluate(() => {
            let title = document.querySelector('.product-desc h3')?.textContent.trim();
            const description = document.querySelector('#tab1 article')?.textContent?.trim();
            const coverImage = document.querySelector('.detail-page-image img')?.src;
            const releaseDate = document.querySelector('.release-date')?.textContent?.trim().replace(/\n|\t/g, '').replace('Released', '');
            const narrators = [];
            document.querySelector('#tab5 ul')?.querySelectorAll('li')?.forEach(narrator => {
                narrators.push(narrator.querySelector('a').textContent.replace(/\n|\t/g, ''));
            });

            const publisher = "Big Finish Productions";
            const publishedYear = releaseDate.split(' ')[2];

            const authors = [];
            document.querySelector('#tab6 ul')?.querySelectorAll('li')?.forEach(author => {
                if (author.textContent.includes('Written by')) {
                    authors.push(author.querySelector('a').textContent.replace(/\n|\t/g, ''));
                }
            });

            let isbn = "";
            document.querySelectorAll('.no-line')?.forEach(item => {
                if (item.textContent.includes('ISBN')) {
                    isbn = item.textContent.split(' ')[item.textContent.split(' ').length - 1];
                }
            });

            let overallSeries = document.querySelector('.product-desc h6 a')?.title;
            let seriesStr = title.split(".");

            let seriesName = "";
            let seriesNumber = "";
            let seriesSequence = "";

            if (seriesStr.length == 3) {
                seriesName = overallSeries + " Series " + seriesStr[0];
                seriesNumber = seriesStr[0];
                seriesSequence = seriesStr[1];
                title = seriesStr[2].trim();
            } else if (seriesStr.length == 2) {
                let stringParts = seriesStr[1].split(":");
                if (overallSeries.includes("-") && overallSeries.includes(stringParts[0].trim())) {
                    seriesName = overallSeries + " Series " + seriesStr[0];
                } else {
                    seriesName = stringParts[0].includes("Series") ? stringParts[0].split("Series")[0].trim() : stringParts[0].trim();
                    title = seriesName + ": " + stringParts[1].trim();
                    seriesName = seriesName + " Series " + seriesStr[0];
                }

                seriesNumber = seriesStr[0];
                seriesSequence = "1";
            }

            series = {
                series: seriesName,
                sequence: seriesSequence,
            }

            return {
                title,
                description,
                publisher,
                coverImage,
                releaseDate,
                publishedYear,
                narrators,
                authors,
                isbn,
                series
            };
        });

        res.json(metadata);
    } catch (error) {
        console.error('Failed to fetch and log page content:', error);
        res.status(500).json({ error: 'Failed to fetch page content.' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Gracefully close Puppeteer on process exit
process.on('exit', closePuppeteer);
process.on('SIGINT', closePuppeteer);
process.on('SIGTERM', closePuppeteer);