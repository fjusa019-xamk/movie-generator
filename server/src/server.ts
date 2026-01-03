    import path from 'path';
    import express from 'express';
    import dotenv from 'dotenv';
    import fs from 'fs';

    // Try multiple possible .env locations
    const possiblePaths = [
        path.join(process.cwd(), '.env'),  // Current directory
        path.join(process.cwd(), '..', '.env'),  // Parent directory
        '/Users/benjamalander/Library/CloudStorage/OneDrive-Telenor/Documents/movie-generator/.env'  // Absolute path
    ];
    
    let envPath = '';
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            envPath = p;
            console.log('Found .env at:', envPath);
            break;
        }
    }
    
    if (envPath) {
        dotenv.config({ path: envPath });
    } else {
        console.warn('Warning: .env file not found in any expected location');
    }
    
    console.log('TMDB_API_KEY loaded:', process.env.TMDB_API_KEY ? 'YES' : 'NO');

    const app : express.Application = express();
    const portti : number = Number(process.env.PORT) || 3000;

    const clientDir = path.resolve(__dirname, '../../client');
    console.log('Serving static from:', clientDir, 'exists:', fs.existsSync(path.join(clientDir, 'index.html')));

    app.use(express.static(clientDir));
    app.get('/', (_req: express.Request, res: express.Response) => {
    res.sendFile(path.join(clientDir, 'index.html'));
    });


    // GENRES
    app.get('/api/genres', async (_req: express.Request, res: express.Response) => {
        const tmdbKey = process.env.TMDB_API_KEY;
        const url = `https://api.themoviedb.org/3/genre/movie/list?api_key=${tmdbKey}&language=en-US`;

        const resp = await fetch(url);
        const data = await resp.json();

        res.json({ genres: data.genres });
    });

    // RANDOM
    app.get('/api/random', async (_req: express.Request, res: express.Response) => {
        try {
            const tmdbKey = process.env.TMDB_API_KEY;
            
            if (!tmdbKey) {
                return res.status(500).json({ error: 'TMDB_API_KEY not configured in environment' });
            }

            const getRandomMovie = async (): Promise<any> => {
                const genresResp = await fetch (`https://api.themoviedb.org/3/genre/movie/list?api_key=${tmdbKey}&language=en-US`);
                const genresData = await genresResp.json();
                
                if (!genresData.genres || !Array.isArray(genresData.genres)) {
                    throw new Error('Failed to fetch genres from TMDb');
                }
                
                const genres = genresData.genres;
                const randomGenre = genres[Math.floor(Math.random() * genres.length)];
                const genreId = randomGenre.id;

                const discoverBase =
                `https://api.themoviedb.org/3/discover/movie?api_key=${tmdbKey}` +
                `&language=en-US` +
                `&with_genres=${genreId}` +
                `&without_genres=10770,16,10402,10751,99` +
                `&with_release_type=2|3` +
                `&include_video=false` +
                `&with_runtime.gte=70` +
                `&sort_by=popularity.desc` +
                `&vote_count.gte=50` +
                `&primary_release_date.gte=1950-01-01` +
                `&include_adult=false`;
                
                const page1Resp = await fetch(`${discoverBase}&page=1`);
                const page1Data = await page1Resp.json();
                const totalPagesRaw = Number(page1Data.total_pages);
                const totalPages = Math.max(1, Math.min(totalPagesRaw || 1, 500));
                const randomPage = Math.floor(Math.random() * totalPages) + 1;

                const pageResp = await fetch(`${discoverBase}&page=${randomPage}`);
                const pageData = await pageResp.json(); 
                const results = Array.isArray(pageData.results) ? pageData.results : [];
                
                if (results.length === 0) {
                    return null;
                }
                
                return results[Math.floor(Math.random() * results.length)];
            };

            let movie = null;
            let attempts = 0;
            const maxAttempts = 3;

            while (!movie && attempts < maxAttempts) {
                movie = await getRandomMovie();
                attempts++;
            }

            if (!movie) {
                return res.status(500).json({ error: 'No movies found after multiple attempts' });
            }

            const posterUrl = movie.poster_path
                ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
                : null;

            const creditsResp = await fetch(`https://api.themoviedb.org/3/movie/${movie.id}/credits?api_key=${tmdbKey}&language=en-US`);
            const creditsData = await creditsResp.json();
            const crew = Array.isArray(creditsData.crew) ? creditsData.crew : [];

            const directors = crew
                .filter((person: any) => person.job === 'Director')
                .map((person: any) => person.name);

            const director = directors.length > 0 ? directors.join(', ') : '';

            res.json({
                title: movie.title,
                release_date: movie.release_date,
                director,
                poster_url: posterUrl
            });
        } catch (error) {
            console.error('Error fetching random movie:', error);
            res.status(500).json({ error: 'Failed to fetch movie' });
        }
    });

    app.listen(portti, () => {
        console.log(`Movie Generator is up and running at http://localhost:${portti}`);
    })