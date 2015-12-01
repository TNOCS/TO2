rem Converts all mrv in this folder to mrvjson

rem Place this script and MarvelXmlToJsonConverter.js into the folder that contains the input files.
rem Make sure  node.exe is added to the PATH variable, and then run this script.

for %%f in (*.mrv) do (
		echo Processing %%f
    		call node MarvelXmlToJsonConverter.js %%f
)




