# UWTimeSchd 
*AKA The Barchive*

A serverless, static web application and automated data pipeline for scraping, parsing, and searching the [UW Time Schedule Archives](https://www.washington.edu/students/timeschd/archive/). 

**[View the live website here!](https://flyingfaller.github.io/uwtimeschd/)**

## What Problem Does UWTimeSchd Solve?

By making all course listings going back to Winter 2004 searchable and viewable on a single page, UWTimeSchd takes much of the guesswork out of schedule planning. Students can easily predict:
* When specific courses are expected to be offered.
* Who is most likely to teach them.
* How many seats will typically be available.

All relevant data available on the official UW Time Schedule Archives is fully searchable and filterable. 

## How to Use the App

[Visit the live site](https://flyingfaller.github.io/uwtimeschd/) and wait a moment for the database to connect. From there, you can explore the data using the following features:

* **Search:** Look up courses by code, name, instructor, SLN, building, or General Ed requirement.
* **Filter:** Use the left sidebar to apply additional filters independently or combined with search terms.
* **Sort:** Organize your results alphabetically by course code, or chronologically by the term and year.
* **View Details:** Click on any course card to expand it and view detailed section information. Use the **Expand All / Collapse All** buttons to toggle the state of every visible course card at once.
* **Load All Data:** Use this button to force the application to fetch and display *every* course matching your search. *(Warning: Loading lots of results can temporarly freeze the page).*
* **Reset/Restart:** If you need to clear your search, use the **RESET ALL** button or perform a hard refresh of the page.
* **Themes:** Toggle between dark and light themes using the button in the upper-left corner.

## How This Was Built

UWTimeSchd operates with a completely serverless architecture:
* **Storage:** A chunked SQLite database hosted directly in the GitHub repository.
* **Frontend:** Queries to the database are directly from the browser using HTTP Range Requests, eliminating the need for a real backend.
* **Backend Pipeline:** A Python-based fetch-parse-normalize-verify pipeline scrapes and cleans the university data.
* **Automation:** A GitHub Actions workflow automatically runs the pipeline to keep the database up to date.

## Contributing & Issues

**Is your course or major missing?**
Submit an `add data` issue on the GitHub repository. Please include the major name, its abbreviation, and a link to the relevant UW time schedule page, and I will try to add it to the database.

**Found a bug or want a feature?** Please open an `issue` and tag it as a `bug` report or `enhancement` request. 

---

## License & Copyright Disclaimer

This repository contains two distinct categories of content: the **Software** (code) and the **Data**. 

**1. The Software (Code)**
The source code of this project (including Python scripts, HTML, CSS, JavaScript, and GitHub Actions workflows) is licensed under the **MIT License**. See the `LICENSE` file for details.

**2. The Data (UW Time Schedules)**
The schedule data, course information, and any compiled databases (e.g., files within the `data/` directory or `.db` files) are **NOT** covered by the MIT License. 
* This data is the property of the University of Washington. 
* I do not own this data, I do not claim any copyright over it, and I cannot grant you a license to use, modify, or distribute it. 
* The data is included in this repository strictly for educational/informational demonstration of the software. 
* This project is not affiliated with, endorsed by, or sponsored by the University of Washington.